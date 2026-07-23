/** 应用背景：极光 + 漂浮光斑 + 噪点纹理（统一包裹，溢出被裁切不触发滚动条） */

export function AppBackground() {
  return (
    <div className="app-bg" aria-hidden>
      <div className="app-aurora" />
      <div className="app-blob blob-cyan" />
      <div className="app-blob blob-purple" />
      <div className="app-blob blob-amber" />
      <div className="app-noise" />
    </div>
  )
}
