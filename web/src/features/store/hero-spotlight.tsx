const lighting = [
  { size: "desktop", width: 601, height: 442, lensX: 433, lensY: 69, endX: 149, endY: 486, spread: 214, lampWidth: 54, shift: 0, blur: 19 },
  { size: "mobile", width: 350, height: 254, lensX: 249, lensY: 45, endX: 81, endY: 278, spread: 124, lampWidth: 34, shift: 14, blur: 12 },
] as const;

export function HeroSpotlight() {
  return lighting.map(({ size, width, height, lensX, lensY, endX, endY, spread, lampWidth, shift, blur }) => {
    const lampHeight = lampWidth * 166 / 113;
    const lampX = lensX - lampWidth * 0.265;
    const mobile = size === "mobile";
    const id = (part: string) => `hero-${size}-${part}`;
    const beam = (start: number, end: number) =>
      `M ${lensX - start} ${lensY - 2} Q ${lensX} ${lensY + 7} ${lensX + start} ${lensY + 2} L ${endX + end} ${endY} H ${endX - end} Z`;
    return (
      <svg
        key={size}
        className={`hero-light hero-light--${size}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={mobile ? "xMidYMid meet" : "none"}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={id("bounce")}>
            <stop stopColor="#d9f7c3" stopOpacity=".19" />
            <stop offset=".48" stopColor="#d9f7c3" stopOpacity=".085" />
            <stop offset="1" stopColor="#d9f7c3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("lens")}>
            <stop stopColor="#f8ffe9" stopOpacity=".2" />
            <stop offset="1" stopColor="#f8ffe9" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("beam")} gradientUnits="userSpaceOnUse" x1={lensX} y1={lensY} x2={endX} y2={endY}>
            <stop stopColor="#f8ffe9" />
            <stop offset=".24" stopColor="#ebf9d2" stopOpacity=".58" />
            <stop offset=".62" stopColor="#e1f4c2" stopOpacity=".31" />
            <stop offset="1" stopColor="#c9f0b8" stopOpacity=".12" />
          </linearGradient>
          <filter id={id("edge")} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
          <filter id={id("softness")} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation={mobile ? 5 : 9} />
          </filter>
        </defs>
        <g transform={`translate(${shift} 0)`}>
          <ellipse cx={width * (mobile ? 0.45 : 0.48)} cy={height * 0.77} rx={width * 0.46} ry={height * 0.68} fill={`url(#${id("bounce")})`} />
          <path d={beam(mobile ? 9 : 13, spread)} fill={`url(#${id("beam")})`} opacity=".23" filter={`url(#${id("edge")})`} />
          <path d={beam(mobile ? 7 : 12, spread * 0.68)} fill={`url(#${id("beam")})`} opacity=".26" filter={`url(#${id("softness")})`} />
          <ellipse cx={lensX} cy={lensY} rx={mobile ? 18 : 32} ry={mobile ? 13 : 21} fill={`url(#${id("lens")})`} />
          <image href="/illustrations/hero-spotlight.webp" x={lampX} y={mobile ? 2 : 0} width={lampWidth} height={lampHeight} />
        </g>
        {mobile && <path d="M24 1H326" stroke="#66997d" strokeOpacity=".66" strokeWidth="2" />}
      </svg>
    );
  });
}
