import * as echarts from 'echarts'
import { fmtBits, fmtBytes, fmtNum, fmtUptime } from './utils'

export const PALETTE = ['#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc']

export function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() }

export const UNITS = {
  bits: { fmt: (v) => fmtBits(v), short: (v) => fmtBits(v, 0) },
  bytes: { fmt: (v) => fmtBytes(v), short: (v) => fmtBytes(v, 0) },
  pct: { fmt: (v) => `${(+v).toFixed(1)} %`, short: (v) => `${Math.round(v)} %`, max: 100 },
  ms: { fmt: (v) => `${(+v).toFixed(2)} ms`, short: (v) => `${fmtNum(v, 0)} ms` },
  s: { fmt: (v) => `${(+v).toFixed(2)} s`, short: (v) => `${fmtNum(v, 1)} s` },
  uptime: { fmt: (v) => fmtUptime(v), short: (v) => `${Math.round(v / 86400)} j` },
  num: { fmt: (v) => fmtNum(v, 2), short: (v) => fmtNum(v, 0) },
  pps: { fmt: (v) => `${fmtNum(v, 2)} pps`, short: (v) => fmtNum(v, 0) },
  ps: { fmt: (v) => `${fmtNum(v, 2)}/s`, short: (v) => fmtNum(v, 0) },
}
export function unitFor(u) {
  if (typeof u === 'string' && UNITS[u]) return UNITS[u]
  if (typeof u === 'string') return { fmt: (v) => `${fmtNum(v, 2)} ${u}`, short: (v) => `${fmtNum(v, 0)} ${u}` }
  return UNITS.num
}

/**
 * Option ECharts pour séries temporelles.
 * series: [{ name, data: [[ms, v], ...], color, area, negate, dashed, stack }]
 */
export function timeOption(series, { unit = 'num', zoom = true, legend = true, compact = false, min, max, stack = false } = {}) {
  const u = unitFor(unit)
  const text = css('--muted') || '#8b97ad'
  const grid = css('--border') || 'rgba(148,163,184,.12)'
  const panel = css('--panel-solid') || '#121a2c'
  const fg = css('--text') || '#e6ebf5'
  return {
    animationDuration: 900,
    animationEasing: 'cubicOut',
    color: PALETTE,
    grid: { left: compact ? 4 : 10, right: compact ? 4 : 16, top: legend && !compact ? 34 : 10, bottom: zoom ? 46 : compact ? 4 : 8, containLabel: !compact },
    legend: legend && !compact ? { top: 0, left: 0, textStyle: { color: text }, icon: 'roundRect', itemWidth: 12, itemHeight: 6 } : undefined,
    tooltip: {
      trigger: 'axis', backgroundColor: panel, borderColor: grid, textStyle: { color: fg, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: css('--accent'), opacity: 0.5 } },
      valueFormatter: (v) => (v === null || v === undefined ? '—' : u.fmt(Math.abs(v))),
    },
    xAxis: { type: 'time', show: !compact, axisLine: { lineStyle: { color: grid } }, axisLabel: { color: text, hideOverlap: true }, splitLine: { show: false } },
    yAxis: {
      type: 'value', show: !compact, min, max,
      axisLabel: { color: text, formatter: (v) => u.short(Math.abs(v)) },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    dataZoom: zoom ? [{ type: 'inside' }, { type: 'slider', height: 22, bottom: 6, borderColor: 'transparent', backgroundColor: 'transparent', fillerColor: 'rgba(34,211,238,.12)', dataBackground: { lineStyle: { color: grid }, areaStyle: { color: grid } }, textStyle: { color: text } }] : undefined,
    series: series.map((s, i) => {
      const color = s.color || PALETTE[i % PALETTE.length]
      return {
        name: s.name, type: 'line', showSymbol: false, smooth: 0.25, sampling: 'lttb', connectNulls: false,
        stack: s.stack || (stack ? 'total' : undefined),
        data: s.negate ? s.data.map(([t, v]) => [t, v === null ? null : -v]) : s.data,
        lineStyle: { width: compact ? 1.5 : 1.8, color, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color },
        areaStyle: s.area === false ? undefined : {
          color: new echarts.graphic.LinearGradient(0, s.negate ? 1 : 0, 0, s.negate ? 0 : 1, [{ offset: 0, color: color + (stack ? 'aa' : '66') }, { offset: 1, color: color + '05' }]),
        },
        emphasis: { focus: 'series' },
      }
    }),
  }
}

export function donutOption(items, { title = '', sub = '' } = {}) {
  const text = css('--text')
  return {
    animationDuration: 1000,
    tooltip: { trigger: 'item', backgroundColor: css('--panel-solid'), borderColor: css('--border'), textStyle: { color: text } },
    title: { text: title, subtext: sub, left: 'center', top: '38%', textStyle: { color: text, fontSize: 26, fontWeight: 700 }, subtextStyle: { color: css('--muted') } },
    series: [{
      type: 'pie', radius: ['62%', '84%'], avoidLabelOverlap: true, padAngle: 2, itemStyle: { borderRadius: 6 },
      label: { show: false }, data: items.filter((i) => i.value > 0).map((i) => ({ ...i, itemStyle: { color: i.color } })),
    }],
  }
}

export function barOption(labels, values, { unit = 'num', color = '#22d3ee', horizontal = true } = {}) {
  const u = unitFor(unit)
  const text = css('--muted')
  const cat = { type: 'category', data: labels, axisLabel: { color: text, width: 140, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } }
  const val = { type: 'value', axisLabel: { color: text, formatter: (v) => u.short(v) }, splitLine: { lineStyle: { color: css('--border'), type: 'dashed' } } }
  return {
    animationDuration: 900,
    grid: { left: 8, right: 20, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: css('--panel-solid'), borderColor: css('--border'), textStyle: { color: css('--text') }, valueFormatter: (v) => u.fmt(v) },
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? { ...cat, inverse: true } : val,
    series: [{
      type: 'bar', data: values, barMaxWidth: 18,
      itemStyle: { borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(horizontal ? 0 : 0, horizontal ? 0 : 1, horizontal ? 1 : 0, 0, [{ offset: 0, color: color + '55' }, { offset: 1, color }]) },
    }],
  }
}
