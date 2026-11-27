export function PlayerAvatar({
  avatar,
  color,
  size = 48,
  dim = false,
  ring = false,
}: {
  avatar: string;
  color: string;
  size?: number;
  dim?: boolean;
  ring?: boolean;
}) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `radial-gradient(circle at 30% 25%, ${color}55, ${color}18 70%)`,
        boxShadow: ring ? `0 0 0 2px ${color}, 0 0 22px ${color}aa` : `0 0 0 1.5px ${color}99`,
        opacity: dim ? 0.4 : 1,
        filter: dim ? "grayscale(0.7)" : undefined,
      }}
    >
      <span aria-hidden>{avatar}</span>
    </span>
  );
}
