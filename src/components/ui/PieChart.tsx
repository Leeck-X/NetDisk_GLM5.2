import { cn } from '@/lib/utils'

export interface PieSlice {
  label: string
  value: number
  color: string
}

interface PieChartProps {
  data: PieSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerSub?: string
  formatValue?: (slice: PieSlice, total: number) => string
  className?: string
}

export function PieChart({
  data,
  size = 168,
  thickness = 22,
  centerLabel,
  centerSub,
  formatValue,
  className,
}: PieChartProps) {
  const total = data.reduce((sum, d) => sum + (d.value > 0 ? d.value : 0), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let acc = 0
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const len = total > 0 ? (d.value / total) * circumference : 0
      const seg = { key: d.label, color: d.color, len, offset: acc }
      acc += len
      return seg
    })

  const valueText = (slice: PieSlice) =>
    formatValue ? formatValue(slice, total) : `${total > 0 ? Math.round((slice.value / total) * 100) : 0}%`

  return (
    <div className={cn('flex flex-col sm:flex-row items-center gap-4 sm:gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={thickness}
          />
          {slices.map((s) => (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.len} ${circumference - s.len}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          ))}
        </svg>
        {(centerLabel || centerSub) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
            {centerLabel && (
              <span className="text-base font-display font-bold text-white leading-tight">{centerLabel}</span>
            )}
            {centerSub && <span className="text-[10px] text-slate-500 mt-0.5">{centerSub}</span>}
          </div>
        )}
      </div>
      <div className="w-full sm:flex-1 min-w-0 space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-slate-400 truncate flex-1">{d.label}</span>
            <span className="text-slate-300 font-mono shrink-0">{valueText(d)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
