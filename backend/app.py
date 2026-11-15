"""LibreNMS XUI — backend.

- Authentification de l'interface (compte local ou jeton LibreNMS personnel).
- Proxy vers l'API LibreNMS v0 (le jeton ne quitte jamais le serveur).
- Export des fichiers RRD de LibreNMS en JSON pour des graphiques interactifs.
- Service des fichiers statiques du frontend (SPA).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


def env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None or v == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on", "oui")


LIBRENMS_URL = os.getenv("LIBRENMS_URL", "http://librenms:8000").rstrip("/")
LIBRENMS_TOKEN = os.getenv("LIBRENMS_TOKEN", "").strip()
LIBRENMS_VERIFY_SSL = env_bool("LIBRENMS_VERIFY_SSL", True)
LIBRENMS_TIMEOUT = float(os.getenv("LIBRENMS_TIMEOUT", "30"))
LIBRENMS_PUBLIC_URL = os.getenv("LIBRENMS_PUBLIC_URL", LIBRENMS_URL).rstrip("/")

UI_AUTH = os.getenv("UI_AUTH", "local").strip().lower()  # local | librenms
UI_USERNAME = os.getenv("UI_USERNAME", "admin")
UI_PASSWORD = os.getenv("UI_PASSWORD", "")
AUTH_DISABLED = env_bool("AUTH_DISABLED", False)
READ_ONLY = env_bool("READ_ONLY", False)
SESSION_HOURS = float(os.getenv("SESSION_HOURS", "12"))
COOKIE_SECURE = env_bool("COOKIE_SECURE", False)

RRD_DIR = Path(os.getenv("RRD_DIR", "/rrd"))
RRDCACHED = os.getenv("RRDCACHED", "").strip()  # ex. unix:/run/rrdcached.sock ou host:42217

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
STATIC_DIR = Path(os.getenv("STATIC_DIR", "/app/static"))
COOKIE = "xui_session"

# Modes d'authentification :
#  - "none"     : AUTH_DISABLED=true
#  - "password" : UI_PASSWORD défini, jeton serveur LIBRENMS_TOKEN utilisé
#  - "librenms" : identifiants LibreNMS (vérifiés par le formulaire web de LibreNMS),
#                 jeton serveur LIBRENMS_TOKEN utilisé, droits selon le rôle LibreNMS
#  - "token"    : chaque utilisateur se connecte avec son propre jeton API LibreNMS
if AUTH_DISABLED:
    AUTH_MODE = "none"
elif UI_AUTH == "librenms" and LIBRENMS_TOKEN:
    AUTH_MODE = "librenms"
elif UI_PASSWORD and LIBRENMS_TOKEN:
    AUTH_MODE = "password"
else:
    AUTH_MODE = "token"

# Sessions côté serveur (en mémoire) : sid -> {"user", "token", "exp"}
SESSIONS: dict[str, dict] = {}

app = FastAPI(title="LibreNMS XUI", docs_url=None, redoc_url=None, openapi_url=None)
client: httpx.AsyncClient | None = None


@app.on_event("startup")
async def _startup() -> None:
    global client
    client = httpx.AsyncClient(
        base_url=LIBRENMS_URL,
        verify=LIBRENMS_VERIFY_SSL,
        timeout=LIBRENMS_TIMEOUT,
        limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
    )
    if LIBRENMS_TOKEN and AUTH_MODE in ("password", "librenms", "none"):
        _spawn(_agg_warmup())


@app.on_event("shutdown")
async def _shutdown() -> None:
    if client:
        await client.aclose()


# --------------------------------------------------------------------------- auth

def _session(request: Request) -> dict | None:
    if AUTH_MODE == "none":
        return {"user": "anonyme", "token": LIBRENMS_TOKEN}
    sid = request.cookies.get(COOKIE)
    if not sid:
        return None
    s = SESSIONS.get(sid)
    if not s:
        return None
    if s["exp"] < time.time():
        SESSIONS.pop(sid, None)
        return None
    return s


def _require(request: Request, need_token: bool = False) -> dict:
    s = _session(request)
    if not s:
        raise HTTPException(401, "Non authentifié")
    if need_token and not s.get("token"):
        raise HTTPException(500, "Aucun jeton LibreNMS configuré (LIBRENMS_TOKEN)")
    return s


def _new_session(response: Response, user: str, token: str, ro: bool = False, role: str = "") -> None:
    sid = secrets.token_urlsafe(32)
    SESSIONS[sid] = {"user": user, "token": token, "ro": ro, "role": role, "exp": time.time() + SESSION_HOURS * 3600}
    response.set_cookie(
        COOKIE, sid, httponly=True, samesite="lax", secure=COOKIE_SECURE,
        max_age=int(SESSION_HOURS * 3600), path="/",
    )


# --------------------------------------------------------------------------- auth LibreNMS
# L'API LibreNMS n'offre pas de vérification de mot de passe : on rejoue le formulaire de
# connexion web (compatible base locale, LDAP, Active Directory…), puis on sonde deux pages
# pour connaître le rôle :
#   /poller/settings (poller.update)  -> 200 : administrateur
#   /poller          (lecture globale) -> 200 : lecture globale (XUI en consultation seule)
#   sinon : utilisateur limité à certains équipements -> refusé (le jeton serveur voit tout)

_CSRF = re.compile(r'name="_token" value="([^"]+)"')
_META_CSRF = re.compile(r'<meta name="csrf-token" content="([^"]+)"')


async def _librenms_check(username: str, password: str) -> str:
    async with httpx.AsyncClient(base_url=LIBRENMS_URL, verify=LIBRENMS_VERIFY_SSL, timeout=LIBRENMS_TIMEOUT,
                                 follow_redirects=False) as c:
        try:
            r = await c.get("/login")
            m = _CSRF.search(r.text)
            if not m:
                raise HTTPException(502, "Formulaire de connexion LibreNMS introuvable")
            r = await c.post("/login", data={"_token": m.group(1), "username": username, "password": password})
            loc = r.headers.get("location", "")
            if r.status_code == 419:
                raise HTTPException(502, "LibreNMS a refusé le jeton CSRF du formulaire de connexion (vérifier LIBRENMS_URL)")
            if r.status_code == 429:
                raise HTTPException(429, "Trop de tentatives : LibreNMS bloque temporairement ce compte")
            if r.status_code not in (301, 302, 303) or loc.rstrip("/").endswith("/login"):
                await asyncio.sleep(0.5)
                raise HTTPException(401, "Identifiants LibreNMS refusés")
            home = await c.get("/")
            if home.is_redirect and "/2fa" in home.headers.get("location", ""):
                raise HTTPException(403, "Ce compte LibreNMS utilise la double authentification, non prise en charge par XUI")
            if home.is_redirect and home.headers.get("location", "").rstrip("/").endswith("/login"):
                raise HTTPException(403, "Compte LibreNMS désactivé ou session refusée")
            admin = (await c.get("/poller/settings")).status_code == 200
            reader = admin or (await c.get("/poller")).status_code == 200
            # ferme la session LibreNMS ouverte pour la vérification
            mt = _META_CSRF.search(home.text or "")
            if mt:
                await c.post("/logout", data={"_token": mt.group(1)})
        except httpx.HTTPError as e:
            raise HTTPException(502, f"LibreNMS injoignable : {e}") from e
    if admin:
        return "admin"
    if reader:
        return "global-read"
    raise HTTPException(403, "Votre compte LibreNMS est limité à certains équipements : "
                             "connectez-vous à XUI avec un compte « global-read » ou « admin »")


@app.get("/xui/config")
async def config(request: Request):
    s = _session(request)
    return {
        "auth_mode": AUTH_MODE,
        "authenticated": bool(s),
        "user": s["user"] if s else None,
        "read_only": READ_ONLY or bool(s and s.get("ro")),
        "role": (s or {}).get("role", ""),
        "librenms_url": LIBRENMS_PUBLIC_URL,
        "rrd": RRD_DIR.is_dir(),
    }


@app.post("/xui/login")
async def login(request: Request, response: Response):
    body = await request.json()
    if AUTH_MODE == "none":
        return {"ok": True}
    if AUTH_MODE == "password":
        u = str(body.get("username", ""))
        p = str(body.get("password", ""))
        await asyncio.sleep(0.3)  # ralentit le bruteforce
        if not (hmac.compare_digest(u, UI_USERNAME) and hmac.compare_digest(p, UI_PASSWORD)):
            raise HTTPException(401, "Identifiants invalides")
        _new_session(response, u, LIBRENMS_TOKEN)
        return {"ok": True, "user": u}
    if AUTH_MODE == "librenms":
        u = str(body.get("username", "")).strip()
        p = str(body.get("password", ""))
        if not u or not p:
            raise HTTPException(400, "Identifiant et mot de passe requis")
        # compte local de secours (UI_USERNAME / UI_PASSWORD), si défini
        if UI_PASSWORD and hmac.compare_digest(u, UI_USERNAME) and hmac.compare_digest(p, UI_PASSWORD):
            _new_session(response, u, LIBRENMS_TOKEN, role="local")
            return {"ok": True, "user": u}
        role = await _librenms_check(u, p)
        _new_session(response, u, LIBRENMS_TOKEN, ro=role != "admin", role=role)
        return {"ok": True, "user": u, "role": role}
    # mode jeton
    token = str(body.get("token", "")).strip()
    if not token:
        raise HTTPException(400, "Jeton requis")
    try:
        r = await client.get("/api/v0/system", headers={"X-Auth-Token": token})
    except httpx.HTTPError as e:
        raise HTTPException(502, f"LibreNMS injoignable : {e}") from e
    if r.status_code != 200:
        await asyncio.sleep(0.5)
        raise HTTPException(401, "Jeton refusé par LibreNMS")
    user = str(body.get("username") or "librenms")
    _new_session(response, user, token)
    return {"ok": True, "user": user}


@app.post("/xui/logout")
async def logout(request: Request, response: Response):
    sid = request.cookies.get(COOKIE)
    if sid:
        SESSIONS.pop(sid, None)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


# --------------------------------------------------------------------------- proxy API

_SECRETS = {"community", "authpass", "cryptopass", "authname"}


def _scrub(raw: bytes) -> bytes:
    """Retire les secrets SNMP des réponses avant de les envoyer au navigateur."""
    try:
        data = json.loads(raw)
    except ValueError:
        return raw

    def walk(o):
        if isinstance(o, dict):
            return {k: ("***" if k in _SECRETS and o[k] else walk(v)) for k, v in o.items()}
        if isinstance(o, list):
            return [walk(x) for x in o]
        return o

    return json.dumps(walk(data)).encode()


_HOP = {"host", "content-length", "connection", "cookie", "authorization", "x-auth-token",
        "accept-encoding", "transfer-encoding", "keep-alive", "origin", "referer"}


@app.api_route("/xui/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    s = _require(request, need_token=True)
    if READ_ONLY and request.method != "GET":
        raise HTTPException(403, "Interface en lecture seule (READ_ONLY=true)")
    if s.get("ro") and request.method != "GET":
        raise HTTPException(403, "Votre rôle LibreNMS ne permet que la consultation")
    if ".." in path.split("/"):
        raise HTTPException(400, "Chemin invalide")
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP}
    headers["X-Auth-Token"] = s["token"]
    headers["Accept"] = request.headers.get("accept", "application/json")
    body = await request.body()
    try:
        r = await client.request(
            request.method, f"/api/v0/{path}", params=request.query_params.multi_items(),
            content=body or None, headers=headers,
        )
    except httpx.HTTPError as e:
        return JSONResponse({"status": "error", "message": f"LibreNMS injoignable : {e}"}, 502)
    ct = r.headers.get("content-type", "application/json")
    out_headers = {}
    content = r.content
    if ct.startswith("application/json") and (path.startswith("devices") or path.startswith("devicegroups")):
        content = _scrub(content)
    if ct.startswith("image/"):
        out_headers["Cache-Control"] = "private, max-age=60"
    return Response(content, status_code=r.status_code, media_type=ct, headers=out_headers)


# --------------------------------------------------------------------------- tableaux de bord
# Stockés dans DATA_DIR/dashboards.json. Chaque tableau a un propriétaire (utilisateur de la
# session XUI) et un niveau de partage : "private", "read" (visible par tous) ou "edit"
# (modifiable par tous).

DASH_FILE = DATA_DIR / "dashboards.json"
_dash_lock = asyncio.Lock()
_ACCESS = ("private", "read", "edit")
_MAX_WIDGETS = 100


def _dash_load() -> dict:
    try:
        data = json.loads(DASH_FILE.read_text())
    except (OSError, ValueError):
        data = {}
    data.setdefault("dashboards", [])
    data.setdefault("defaults", {})
    return data


def _dash_save(data: dict) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = DASH_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        tmp.replace(DASH_FILE)
    except OSError as e:
        raise HTTPException(500, f"Impossible d'enregistrer les tableaux de bord : {e}") from e


def _dash_view(d: dict, user: str) -> dict:
    mine = d["owner"] == user
    return {**d, "mine": mine, "can_edit": mine or d["access"] == "edit"}


def _dash_visible(d: dict, user: str) -> bool:
    return d["owner"] == user or d["access"] != "private"


def _clean_widgets(raw) -> list:
    if not isinstance(raw, list):
        raise HTTPException(400, "widgets doit être une liste")
    out, seen = [], set()
    for w in raw[:_MAX_WIDGETS]:
        if not isinstance(w, dict) or not isinstance(w.get("type"), str):
            continue
        wid = str(w.get("i") or secrets.token_hex(6))[:40]
        if wid in seen:
            wid = secrets.token_hex(6)
        seen.add(wid)
        cfg = w.get("config") if isinstance(w.get("config"), dict) else {}
        if len(json.dumps(cfg)) > 20000:
            raise HTTPException(400, "Configuration de widget trop volumineuse")

        def num(k, lo, hi, dflt):
            try:
                return max(lo, min(hi, int(w.get(k, dflt))))
            except (TypeError, ValueError):
                return dflt

        width = num("w", 1, 12, 4)
        out.append({"i": wid, "type": w["type"][:40], "x": num("x", 0, 12 - width, 0), "y": num("y", 0, 10000, 0),
                    "w": width, "h": num("h", 1, 60, 6), "config": cfg})
    return out


def _apply_fields(d: dict, body: dict, *, owner: bool) -> None:
    if "name" in body:
        name = str(body["name"]).strip()[:80]
        if not name:
            raise HTTPException(400, "Nom requis")
        d["name"] = name
    if "access" in body and owner:
        if body["access"] not in _ACCESS:
            raise HTTPException(400, "Partage invalide")
        d["access"] = body["access"]
    if "widgets" in body:
        d["widgets"] = _clean_widgets(body["widgets"])
    d["updated"] = int(time.time())


@app.get("/xui/dashboards")
async def dash_list(request: Request):
    user = _require(request)["user"]
    data = _dash_load()
    items = [{k: v for k, v in _dash_view(d, user).items() if k != "widgets"} | {"widgets": len(d["widgets"])}
             for d in data["dashboards"] if _dash_visible(d, user)]
    items.sort(key=lambda d: (not d["mine"], d["name"].lower()))
    default = data["defaults"].get(user)
    if not any(d["id"] == default for d in items):
        default = items[0]["id"] if items else None
    return {"items": items, "default": default, "user": user}


@app.get("/xui/dashboards/{dash_id}")
async def dash_get(dash_id: str, request: Request):
    user = _require(request)["user"]
    d = next((d for d in _dash_load()["dashboards"] if d["id"] == dash_id), None)
    if not d or not _dash_visible(d, user):
        raise HTTPException(404, "Tableau de bord introuvable")
    return _dash_view(d, user)


@app.post("/xui/dashboards")
async def dash_create(request: Request):
    user = _require(request)["user"]
    body = await request.json()
    async with _dash_lock:
        data = _dash_load()
        mine = [d for d in data["dashboards"] if d["owner"] == user]
        if len(mine) >= 50:
            raise HTTPException(400, "Trop de tableaux de bord (50 max.)")
        d = {"id": secrets.token_hex(8), "name": "Nouveau tableau", "owner": user, "access": "private",
             "widgets": [], "created": int(time.time())}
        _apply_fields(d, body, owner=True)
        data["dashboards"].append(d)
        if not mine:
            data["defaults"][user] = d["id"]
        _dash_save(data)
    return _dash_view(d, user)


@app.put("/xui/dashboards/{dash_id}")
async def dash_update(dash_id: str, request: Request):
    user = _require(request)["user"]
    body = await request.json()
    async with _dash_lock:
        data = _dash_load()
        d = next((d for d in data["dashboards"] if d["id"] == dash_id), None)
        if not d or not _dash_visible(d, user):
            raise HTTPException(404, "Tableau de bord introuvable")
        if d["owner"] != user and d["access"] != "edit":
            raise HTTPException(403, "Ce tableau de bord est en lecture seule pour vous")
        _apply_fields(d, body, owner=d["owner"] == user)
        _dash_save(data)
    return _dash_view(d, user)


@app.delete("/xui/dashboards/{dash_id}")
async def dash_delete(dash_id: str, request: Request):
    user = _require(request)["user"]
    async with _dash_lock:
        data = _dash_load()
        d = next((d for d in data["dashboards"] if d["id"] == dash_id), None)
        if not d or d["owner"] != user:
            raise HTTPException(403, "Seul le propriétaire peut supprimer ce tableau de bord")
        data["dashboards"].remove(d)
        data["defaults"] = {u: i for u, i in data["defaults"].items() if i != dash_id}
        _dash_save(data)
    return {"ok": True}


@app.post("/xui/dashboards/{dash_id}/default")
async def dash_default(dash_id: str, request: Request):
    user = _require(request)["user"]
    async with _dash_lock:
        data = _dash_load()
        d = next((d for d in data["dashboards"] if d["id"] == dash_id), None)
        if not d or not _dash_visible(d, user):
            raise HTTPException(404, "Tableau de bord introuvable")
        data["defaults"][user] = dash_id
        _dash_save(data)
    return {"ok": True}


# --------------------------------------------------------------------------- schémas
# DATA_DIR/diagrams.json (+ images de fond dans DATA_DIR/diagram-bg/). Même modèle de
# propriétaire / partage que les tableaux de bord.

DIAG_FILE = DATA_DIR / "diagrams.json"
DIAG_BG_DIR = DATA_DIR / "diagram-bg"
DIAG_IMG_DIR = DATA_DIR / "diagram-img"  # bibliothèque d'images d'équipements (partagée)
_IMG_NAME_RE = re.compile(r"^[0-9a-f]{16}\.(png|jpg|webp|gif)$")
_NODE_DISPLAYS = ("card", "icon", "image")
_diag_lock = asyncio.Lock()
_BG_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}
_NODE_KINDS = ("device", "text", "cloud")


def _diag_load() -> dict:
    try:
        data = json.loads(DIAG_FILE.read_text())
    except (OSError, ValueError):
        data = {}
    data.setdefault("diagrams", [])
    return data


def _diag_save(data: dict) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        tmp = DIAG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        tmp.replace(DIAG_FILE)
    except OSError as e:
        raise HTTPException(500, f"Impossible d'enregistrer les schémas : {e}") from e


def _num(v, lo, hi, dflt):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return dflt


def _txt(v, n=120):
    return str(v)[:n] if v is not None else ""


def _clean_diagram(body: dict, d: dict) -> None:
    if "nodes" in body:
        if not isinstance(body["nodes"], list):
            raise HTTPException(400, "nodes doit être une liste")
        nodes, ids = [], set()
        for n in body["nodes"][:500]:
            if not isinstance(n, dict):
                continue
            nid = _txt(n.get("id"), 40) or secrets.token_hex(5)
            if nid in ids:
                continue
            ids.add(nid)
            kind = n.get("kind") if n.get("kind") in _NODE_KINDS else "device"
            dev = n.get("device_id")
            nodes.append({
                "id": nid, "kind": kind, "x": _num(n.get("x"), -20000, 20000, 0), "y": _num(n.get("y"), -20000, 20000, 0),
                "device_id": int(dev) if kind == "device" and str(dev).isdigit() else None,
                "label": _txt(n.get("label")), "size": _num(n.get("size"), 0.5, 3, 1),
                "image": n.get("image") if isinstance(n.get("image"), str) and _IMG_NAME_RE.match(n["image"]) else None,
                "display": n.get("display") if n.get("display") in _NODE_DISPLAYS else "card",
            })
        d["nodes"] = nodes
    if "links" in body:
        if not isinstance(body["links"], list):
            raise HTTPException(400, "links doit être une liste")
        ids = {n["id"] for n in d.get("nodes", [])}
        links = []
        for lk in body["links"][:1000]:
            if not isinstance(lk, dict) or lk.get("a") not in ids or lk.get("b") not in ids or lk.get("a") == lk.get("b"):
                continue
            pa, pb = lk.get("port_a"), lk.get("port_b")
            links.append({
                "id": _txt(lk.get("id"), 40) or secrets.token_hex(5), "a": lk["a"], "b": lk["b"],
                "port_a": int(pa) if str(pa).isdigit() else None, "port_b": int(pb) if str(pb).isdigit() else None,
                "label": _txt(lk.get("label"), 60), "bend": _num(lk.get("bend"), -400, 400, 0),
            })
        d["links"] = links
    if "view" in body and isinstance(body["view"], dict):
        v = body["view"]
        d["view"] = {
            "background": v.get("background") if v.get("background") in ("none", "grid", "image") else "grid",
            "showRates": bool(v.get("showRates", True)), "showPorts": bool(v.get("showPorts", True)),
            "bgOpacity": _num(v.get("bgOpacity"), 0.05, 1, 0.6),
            "bgW": _num(v.get("bgW"), 0, 20000, 0), "bgH": _num(v.get("bgH"), 0, 20000, 0),
            "colorMode": "rate" if v.get("colorMode") == "rate" else "util",
            "utilSteps": _color_steps(v.get("utilSteps"), 100), "rateSteps": _color_steps(v.get("rateSteps"), 1e7),
            "downColor": _hex(v.get("downColor")) or None,
        }


_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _hex(v) -> str:
    return v if isinstance(v, str) and _HEX_RE.match(v) else ""


def _color_steps(steps, hi: float):
    """Paliers de couleur d'un schéma : [{min, color}], 10 max. ; None = valeurs par défaut."""
    if not isinstance(steps, list):
        return None
    out = [{"min": _num(s.get("min"), 0, hi, 0), "color": _hex(s.get("color"))}
           for s in steps[:10] if isinstance(s, dict) and _hex(s.get("color"))]
    return sorted(out, key=lambda s: s["min"]) or None


def _diag_summary(d: dict, user: str) -> dict:
    v = _dash_view(d, user)
    return {k: v[k] for k in ("id", "name", "owner", "access", "mine", "can_edit", "updated")} | {
        "nodes": len(d.get("nodes", [])), "links": len(d.get("links", [])), "has_bg": bool(d.get("bg"))}


def _diag_find(data: dict, diag_id: str, user: str, write: bool = False) -> dict:
    d = next((x for x in data["diagrams"] if x["id"] == diag_id), None)
    if not d or not _dash_visible(d, user):
        raise HTTPException(404, "Schéma introuvable")
    if write and d["owner"] != user and d["access"] != "edit":
        raise HTTPException(403, "Ce schéma est en lecture seule pour vous")
    return d


@app.get("/xui/diagrams")
async def diag_list(request: Request):
    user = _require(request)["user"]
    items = [_diag_summary(d, user) for d in _diag_load()["diagrams"] if _dash_visible(d, user)]
    items.sort(key=lambda d: (not d["mine"], d["name"].lower()))
    return {"items": items, "user": user}


@app.get("/xui/diagrams/{diag_id}")
async def diag_get(diag_id: str, request: Request):
    user = _require(request)["user"]
    return _dash_view(_diag_find(_diag_load(), diag_id, user), user)


@app.post("/xui/diagrams")
async def diag_create(request: Request):
    user = _require(request)["user"]
    body = await request.json()
    async with _diag_lock:
        data = _diag_load()
        if len([d for d in data["diagrams"] if d["owner"] == user]) >= 100:
            raise HTTPException(400, "Trop de schémas (100 max.)")
        d = {"id": secrets.token_hex(8), "name": "Nouveau schéma", "owner": user, "access": "private",
             "nodes": [], "links": [], "view": {"background": "grid", "showRates": True, "showPorts": True},
             "bg": None, "created": int(time.time())}
        _apply_fields(d, {k: v for k, v in body.items() if k in ("name", "access")}, owner=True)
        _clean_diagram(body, d)
        data["diagrams"].append(d)
        _diag_save(data)
    return _dash_view(d, user)


@app.put("/xui/diagrams/{diag_id}")
async def diag_update(diag_id: str, request: Request):
    user = _require(request)["user"]
    body = await request.json()
    async with _diag_lock:
        data = _diag_load()
        d = _diag_find(data, diag_id, user, write=True)
        _apply_fields(d, {k: v for k, v in body.items() if k in ("name", "access")}, owner=d["owner"] == user)
        _clean_diagram(body, d)
        _diag_save(data)
    return _dash_view(d, user)


@app.delete("/xui/diagrams/{diag_id}")
async def diag_delete(diag_id: str, request: Request):
    user = _require(request)["user"]
    async with _diag_lock:
        data = _diag_load()
        d = _diag_find(data, diag_id, user)
        if d["owner"] != user:
            raise HTTPException(403, "Seul le propriétaire peut supprimer ce schéma")
        data["diagrams"].remove(d)
        _diag_save(data)
        if d.get("bg"):
            (DIAG_BG_DIR / d["bg"]).unlink(missing_ok=True)
    return {"ok": True}


@app.put("/xui/diagrams/{diag_id}/background")
async def diag_bg_put(diag_id: str, request: Request):
    """Image de fond : corps brut (pas de SVG, qui pourrait embarquer du script)."""
    user = _require(request)["user"]
    ext = _BG_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip().lower())
    if not ext:
        raise HTTPException(415, "Formats acceptés : PNG, JPEG, WebP, GIF")
    raw = await request.body()
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image vide ou trop volumineuse (8 Mo max.)")
    async with _diag_lock:
        data = _diag_load()
        d = _diag_find(data, diag_id, user, write=True)
        DIAG_BG_DIR.mkdir(parents=True, exist_ok=True)
        if d.get("bg"):
            (DIAG_BG_DIR / d["bg"]).unlink(missing_ok=True)
        name = f"{d['id']}-{secrets.token_hex(4)}.{ext}"
        (DIAG_BG_DIR / name).write_bytes(raw)
        d["bg"] = name
        d["updated"] = int(time.time())
        _diag_save(data)
    return {"ok": True, "bg": name}


@app.delete("/xui/diagrams/{diag_id}/background")
async def diag_bg_delete(diag_id: str, request: Request):
    user = _require(request)["user"]
    async with _diag_lock:
        data = _diag_load()
        d = _diag_find(data, diag_id, user, write=True)
        if d.get("bg"):
            (DIAG_BG_DIR / d["bg"]).unlink(missing_ok=True)
        d["bg"] = None
        _diag_save(data)
    return {"ok": True}


@app.get("/xui/diagrams/{diag_id}/background")
async def diag_bg_get(diag_id: str, request: Request):
    user = _require(request)["user"]
    d = _diag_find(_diag_load(), diag_id, user)
    f = DIAG_BG_DIR / (d.get("bg") or "")
    if not d.get("bg") or not f.is_file():
        raise HTTPException(404, "Pas d'image de fond")
    mt = next((k for k, v in _BG_TYPES.items() if f.suffix == "." + v), "application/octet-stream")
    return FileResponse(f, media_type=mt, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})


@app.get("/xui/diagram-images")
async def diag_img_list(request: Request):
    _require(request)
    if not DIAG_IMG_DIR.is_dir():
        return []
    files = [f for f in DIAG_IMG_DIR.iterdir() if _IMG_NAME_RE.match(f.name)]
    return [{"name": f.name, "size": f.stat().st_size, "mtime": int(f.stat().st_mtime)}
            for f in sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)]


@app.post("/xui/diagram-images")
async def diag_img_put(request: Request):
    """Image d'équipement : corps brut, PNG/JPEG/WebP/GIF (pas de SVG), 2 Mo max. Dédupliquée par contenu."""
    _require(request)
    ext = _BG_TYPES.get(request.headers.get("content-type", "").split(";")[0].strip().lower())
    if not ext:
        raise HTTPException(415, "Formats acceptés : PNG, JPEG, WebP, GIF")
    raw = await request.body()
    if not raw or len(raw) > 2 * 1024 * 1024:
        raise HTTPException(413, "Image vide ou trop volumineuse (2 Mo max.)")
    name = f"{hashlib.sha256(raw).hexdigest()[:16]}.{ext}"
    DIAG_IMG_DIR.mkdir(parents=True, exist_ok=True)
    f = DIAG_IMG_DIR / name
    if not f.exists():
        f.write_bytes(raw)
    return {"name": name}


@app.get("/xui/diagram-images/{name}")
async def diag_img_get(name: str, request: Request):
    _require(request)
    f = DIAG_IMG_DIR / name
    if not _IMG_NAME_RE.match(name) or not f.is_file():
        raise HTTPException(404, "Image introuvable")
    mt = next(k for k, v in _BG_TYPES.items() if f.suffix == "." + v)
    return FileResponse(f, media_type=mt, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400, immutable"})


@app.delete("/xui/diagram-images/{name}")
async def diag_img_delete(name: str, request: Request):
    _require(request)
    if not _IMG_NAME_RE.match(name):
        raise HTTPException(404, "Image introuvable")
    async with _diag_lock:
        used = [d for d in _diag_load()["diagrams"] if any(n.get("image") == name for n in d.get("nodes", []))]
        if used:
            raise HTTPException(409, "Image utilisée dans : " + ", ".join(d.get("name", "?") for d in used[:5]))
        (DIAG_IMG_DIR / name).unlink(missing_ok=True)
    return {"ok": True}


# --------------------------------------------------------------------------- santé agrégée
# L'API LibreNMS n'a pas d'endpoint global pour le stockage ni la mémoire : on interroge chaque
# équipement puis chaque élément, en parallèle, avec un cache court par jeton.

_agg_cache: dict[str, tuple[float, list]] = {}
# LibreNMS n'a qu'un nombre limité de processus PHP (15 par défaut) : les agrégations partagent
# ce plafond de requêtes simultanées pour laisser de la place aux pages consultées.
AGG_CONCURRENCY = int(os.getenv("AGG_CONCURRENCY", "6"))
_agg_sem: asyncio.Semaphore | None = None


def _agg_semaphore() -> asyncio.Semaphore:
    global _agg_sem
    if _agg_sem is None:
        _agg_sem = asyncio.Semaphore(AGG_CONCURRENCY)
    return _agg_sem
_agg_locks: dict[str, asyncio.Lock] = {}
AGG_TTL = 60


def _map_storage(d: dict, g: dict) -> dict:
    return {
        "device_id": d["device_id"], "hostname": d["hostname"], "storage_id": g.get("storage_id"),
        "descr": g.get("storage_descr"), "type": g.get("storage_type"), "mib": g.get("type"),
        "size": g.get("storage_size"), "used": g.get("storage_used"), "free": g.get("storage_free"),
        "perc": g.get("storage_perc"), "warn": g.get("storage_perc_warn"),
    }


def _map_mempool(d: dict, g: dict) -> dict:
    return {
        "device_id": d["device_id"], "hostname": d["hostname"], "mempool_id": g.get("mempool_id"),
        "descr": g.get("mempool_descr"), "cls": g.get("mempool_class"), "type": g.get("mempool_type"),
        "total": g.get("mempool_total"), "used": g.get("mempool_used"), "free": g.get("mempool_free"),
        "perc": g.get("mempool_perc"), "warn": g.get("mempool_perc_warn"),
    }


def _map_processor(d: dict, g: dict) -> dict:
    return {
        "device_id": d["device_id"], "hostname": d["hostname"], "processor_id": g.get("processor_id"),
        "descr": g.get("processor_descr"), "type": g.get("processor_type"), "index": g.get("processor_index"),
        "usage": g.get("processor_usage"), "warn": g.get("processor_perc_warn"),
    }


_AGG = {
    "storage": ("device_storage", _map_storage),
    "memory": ("device_mempool", _map_mempool),
    "cpu": ("device_processor", _map_processor),
}


async def _lnms_get(token: str, path: str):
    r = await client.get(f"/api/v0/{path}", headers={"X-Auth-Token": token, "Accept": "application/json"})
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


_PERIODS = (86400, 604800, 2592000, 31536000)


async def _availability_for(d: dict, h: str, get) -> list:
    av, out = await asyncio.gather(get(f"devices/{h}/availability"), get(f"devices/{h}/outages"))
    now = time.time()
    perc = {str(a.get("duration")): float(a["availability_perc"])
            for a in (av or {}).get("availability", []) if a.get("availability_perc") is not None}
    outages = sorted((o for o in (out or {}).get("outages", []) if o.get("going_down")),
                     key=lambda o: -int(o["going_down"]))
    stats = {}
    for p in _PERIODS:
        since = now - p
        sel = [o for o in outages if (o.get("up_again") or now) > since]
        down = sum(min(o.get("up_again") or now, now) - max(int(o["going_down"]), since) for o in sel)
        stats[str(p)] = {"count": len(sel), "down": int(max(0, down))}
    return [{
        "device_id": d["device_id"], "hostname": d["hostname"], "perc": perc, "stats": stats,
        "ongoing": bool(outages and not outages[0].get("up_again")),
        "recent": [{"start": int(o["going_down"]), "end": o.get("up_again")} for o in outages[:15]],
    }]


_TONER = re.compile(r"^toner-(.+)-(\d+)\.rrd$")


async def _printer_for(d: dict) -> list:
    """Niveaux des consommables : l'API LibreNMS ne les expose pas, on lit la dernière valeur
    des fichiers toner-<type>-<index>.rrd (en %, déjà normalisés par LibreNMS)."""
    if d.get("type") != "printer" or not RRD_DIR.is_dir():
        return []
    try:
        hdir = _rrd_host_dir(str(d["hostname"]))
    except HTTPException:
        return [{"device_id": d["device_id"], "hostname": d["hostname"], "supplies": []}]
    supplies = []
    for f in sorted(hdir.glob("toner-*.rrd")):
        m = _TONER.match(f.name)
        if not m:
            continue
        try:
            out = (await _run("lastupdate", str(f))).strip().splitlines()
            ts, val = out[-1].split(":", 1)
            v = val.strip().split()[0]
            value = None if v.upper() in ("U", "NAN") else float(v)
        except (HTTPException, ValueError, IndexError):
            continue
        supplies.append({"type": m.group(1), "index": int(m.group(2)), "value": value, "updated": int(ts)})
    return [{"device_id": d["device_id"], "hostname": d["hostname"], "supplies": supplies}]


async def _collect_wireless(token: str) -> list:
    data = await _lnms_get(token, "devices")
    devs = [d for d in (data or {}).get("devices", []) if not int(d.get("disabled") or 0)]
    sem = _agg_semaphore()

    async def one(d):
        async with sem:
            try:
                r = await _lnms_get(token, f"devices/{quote(str(d['hostname']), safe='')}/wireless-sensors")
            except httpx.HTTPError:
                return []
        keep = ("sensor_id", "sensor_class", "sensor_type", "sensor_index", "sensor_descr", "sensor_current",
                "sensor_limit", "sensor_limit_warn", "sensor_limit_low", "sensor_limit_low_warn")
        return [{"device_id": d["device_id"], "hostname": d["hostname"], **{k: x.get(k) for k in keep}}
                for x in (r or {}).get("wireless_sensors", [])]

    return [x for r in await asyncio.gather(*(one(d) for d in devs)) for x in r]


async def _collect(token: str, kind: str) -> list:
    if kind == "wireless":
        return await _collect_wireless(token)
    if kind == "printers":
        data = await _lnms_get(token, "devices")
        devs = [d for d in (data or {}).get("devices", []) if not int(d.get("disabled") or 0)]
        return [x for r in await asyncio.gather(*(_printer_for(d) for d in devs)) for x in r]
    custom = kind == "availability"
    health, mapper = _AGG.get(kind, (None, None))
    data = await _lnms_get(token, "devices")
    devices = [d for d in (data or {}).get("devices", []) if not int(d.get("disabled") or 0)]
    sem = _agg_semaphore()

    async def get(path):
        async with sem:
            try:
                return await _lnms_get(token, path)
            except httpx.HTTPError:
                return None

    async def per_device(d):
        h = quote(str(d["hostname"]), safe="")
        if custom:
            return await _availability_for(d, h, get)
        lst = await get(f"devices/{h}/health/{health}")
        ids = [g.get("sensor_id") for g in (lst or {}).get("graphs", [])]
        details = await asyncio.gather(*(get(f"devices/{h}/health/{health}/{i}") for i in ids if i))
        return [mapper(d, g) for det in details for g in (det or {}).get("graphs", [])[:1]]

    results = await asyncio.gather(*(per_device(d) for d in devices))
    return [x for r in results for x in r]


def _agg_key(token: str, kind: str) -> str:
    return kind + ":" + hmac.new(b"xui-agg", token.encode(), "sha256").hexdigest()


async def _agg_refresh(token: str, kind: str) -> tuple[float, list]:
    key = _agg_key(token, kind)
    lock = _agg_locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _agg_cache.get(key)
        if hit and time.time() - hit[0] < AGG_TTL:  # rafraîchi entre-temps par un autre appel
            return hit
        items = await _collect(token, kind)
        _agg_cache[key] = (time.time(), items)
        return _agg_cache[key]


_agg_bg: set[str] = set()
_tasks: set[asyncio.Task] = set()  # références fortes vers les tâches d'arrière-plan


def _spawn(coro) -> None:
    t = asyncio.get_running_loop().create_task(coro)
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def _agg_background(token: str, kind: str) -> None:
    key = _agg_key(token, kind)
    if key in _agg_bg:
        return
    _agg_bg.add(key)

    async def run():
        try:
            await _agg_refresh(token, kind)
        except Exception:  # noqa: BLE001 — un échec garde simplement les anciennes données
            pass
        finally:
            _agg_bg.discard(key)

    _spawn(run())


async def _aggregate(request: Request, kind: str, fresh: bool):
    """Cache « stale-while-revalidate » : des données expirées sont renvoyées tout de suite et
    rafraîchies en arrière-plan ; on n'attend LibreNMS que la toute première fois."""
    s = _require(request, need_token=True)
    hit = _agg_cache.get(_agg_key(s["token"], kind))
    if hit and not fresh:
        if time.time() - hit[0] >= AGG_TTL:
            _agg_background(s["token"], kind)
        return {"items": hit[1], "updated": int(hit[0])}
    try:
        ts, items = await _agg_refresh(s["token"], kind)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"LibreNMS injoignable : {e}") from e
    return {"items": items, "updated": int(ts)}


async def _agg_warmup() -> None:
    """Au démarrage, remplit les caches avec le jeton serveur (mode mot de passe / comptes LibreNMS)."""
    await asyncio.sleep(2)
    for kind in ("cpu", "memory", "storage", "wireless", "printers", "availability"):
        try:
            await _agg_refresh(LIBRENMS_TOKEN, kind)
        except Exception:  # noqa: BLE001
            pass


@app.get("/xui/storage")
async def storage_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "storage", fresh)


@app.get("/xui/wireless")
async def wireless_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "wireless", fresh)


@app.get("/xui/printers")
async def printers_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "printers", fresh)


@app.get("/xui/availability")
async def availability_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "availability", fresh)


@app.get("/xui/cpu")
async def cpu_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "cpu", fresh)


@app.get("/xui/memory")
async def memory_all(request: Request, fresh: bool = False):
    return await _aggregate(request, "memory", fresh)


# --------------------------------------------------------------------------- RRD

_SAFE = re.compile(r"^[A-Za-z0-9._:\-\[\]@ ]+$")
_info_cache: dict[str, tuple[float, dict]] = {}


def _rrd_host_dir(host: str) -> Path:
    if not host or not _SAFE.match(host) or host.startswith("."):
        raise HTTPException(400, "Hôte invalide")
    d = (RRD_DIR / host).resolve()
    if RRD_DIR.resolve() not in d.parents or not d.is_dir():
        raise HTTPException(404, "Aucun RRD pour cet hôte")
    return d


def _rrd_file(host: str, name: str) -> Path:
    d = _rrd_host_dir(host)
    if not name.endswith(".rrd") or "/" in name or not _SAFE.match(name):
        raise HTTPException(400, "Fichier invalide")
    f = d / name
    if not f.is_file():
        raise HTTPException(404, f"RRD introuvable : {name}")
    return f


async def _run(*args: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "rrdtool", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await asyncio.wait_for(proc.communicate(), timeout=20)
    if proc.returncode != 0:
        raise HTTPException(500, f"rrdtool : {err.decode(errors='replace').strip()}")
    return out.decode(errors="replace")


async def _rrd_info(f: Path) -> dict:
    key = str(f)
    mtime = f.stat().st_mtime
    c = _info_cache.get(key)
    if c and c[0] == mtime:
        return c[1]
    txt = await _run("info", str(f))
    ds: dict[str, dict] = {}
    step = 300
    last = 0
    for line in txt.splitlines():
        m = re.match(r'ds\[([^\]]+)\]\.(type|min|max) = "?([^"]*)"?', line)
        if m:
            ds.setdefault(m.group(1), {})[m.group(2)] = m.group(3)
        elif line.startswith("step = "):
            step = int(line.split("=")[1])
        elif line.startswith("last_update = "):
            last = int(line.split("=")[1])
    info = {"ds": list(ds.keys()), "types": {k: v.get("type") for k, v in ds.items()},
            "step": step, "last_update": last}
    _info_cache[key] = (mtime, info)
    return info


def _daemon_args() -> list[str]:
    return ["--daemon", RRDCACHED] if RRDCACHED else []


@app.get("/xui/rrd/{host}")
async def rrd_list(host: str, request: Request):
    _require(request)
    d = _rrd_host_dir(host)
    files = []
    for f in sorted(d.iterdir()):
        if f.suffix == ".rrd":
            st = f.stat()
            files.append({"name": f.name, "size": st.st_size, "mtime": int(st.st_mtime)})
    return {"host": host, "files": files}


@app.get("/xui/rrd/{host}/{name}/info")
async def rrd_info(host: str, name: str, request: Request):
    _require(request)
    return await _rrd_info(_rrd_file(host, name))


def _parse_time(v: str | None, default: str) -> str:
    v = (v or default).strip()
    if not re.match(r"^(now|-?\d+[smhdwMy]?|[-+]?\d+|end-\d+[smhdwMy]?|e-\d+[smhdwMy]?)$", v):
        raise HTTPException(400, f"Temps invalide : {v}")
    return v


async def _xport(f: Path, ds: list[str] | None, start: str, end: str, cf: str, rows: int) -> dict:
    info = await _rrd_info(f)
    names = [d for d in (ds or info["ds"]) if d in info["ds"]]
    if not names:
        raise HTTPException(400, "Aucune source de données")
    args = ["xport", *_daemon_args(), "--start", start, "--end", end, "--maxrows", str(rows)]
    for i, n in enumerate(names):
        args += [f"DEF:d{i}={f}:{n}:{cf}", f"XPORT:d{i}:{n}"]
    xml = await _run(*args)
    root = ET.fromstring(xml)
    meta = root.find("meta")
    t0 = int(meta.findtext("start"))
    step = int(meta.findtext("step"))
    legends = [e.text for e in meta.find("legend").findall("entry")]
    series = {n: [] for n in legends}
    ts = []
    for i, row in enumerate(root.find("data").findall("row")):
        t = row.findtext("t")
        ts.append(int(t) if t else t0 + i * step)
        for n, v in zip(legends, row.findall("v")):
            try:
                x = float(v.text)
                series[n].append(None if x != x else x)  # NaN -> None
            except (TypeError, ValueError):
                series[n].append(None)
    return {"start": t0, "step": step, "timestamps": ts, "series": series,
            "types": {n: info["types"].get(n) for n in legends}}


@app.get("/xui/rrd/{host}/{name}/data")
async def rrd_data(host: str, name: str, request: Request, ds: str | None = None,
                   start: str | None = None, end: str | None = None, cf: str = "AVERAGE",
                   rows: int = 400):
    _require(request)
    if cf not in ("AVERAGE", "MAX", "MIN", "LAST"):
        raise HTTPException(400, "CF invalide")
    f = _rrd_file(host, name)
    return await _xport(f, ds.split(",") if ds else None, _parse_time(start, "-1d"),
                        _parse_time(end, "now"), cf, max(20, min(rows, 2000)))


@app.post("/xui/rrd/batch")
async def rrd_batch(request: Request):
    """Plusieurs exports en une requête : {items:[{host,name,ds,start,end,cf,rows}]}"""
    _require(request)
    body = await request.json()
    items = body.get("items", [])[:200]

    async def one(it):
        try:
            f = _rrd_file(it["host"], it["name"])
            ds = it.get("ds")
            if isinstance(ds, str):
                ds = [x for x in ds.split(",") if x]
            return await _xport(f, ds or None, _parse_time(it.get("start"), "-1d"),
                                _parse_time(it.get("end"), "now"), it.get("cf", "AVERAGE"),
                                max(20, min(int(it.get("rows", 120)), 2000)))
        except HTTPException as e:
            return {"error": e.detail}

    sem = asyncio.Semaphore(8)

    async def guarded(it):
        async with sem:
            return await one(it)

    return {"results": await asyncio.gather(*(guarded(i) for i in items))}


# --------------------------------------------------------------------------- statique / SPA

@app.get("/healthz")
async def healthz():
    return {"ok": True}


if (STATIC_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
async def spa(full_path: str):
    if full_path.startswith("xui/"):
        raise HTTPException(404)
    f = (STATIC_DIR / full_path).resolve()
    if full_path and STATIC_DIR.resolve() in f.parents and f.is_file():
        return FileResponse(f)
    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "frontend non construit"}, 503)
