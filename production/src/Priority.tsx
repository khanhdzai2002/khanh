export function highestPriority(items: { priority: string }[]) {
  return items.some((i) => i.priority === "CẤP BÁCH")
    ? "CẤP BÁCH"
    : items.some((i) => i.priority === "ƯU TIÊN")
      ? "ƯU TIÊN"
      : "THƯỜNG";
}
export const priorityClass = (value: string) =>
  value === "CẤP BÁCH"
    ? "priority-urgent"
    : value === "ƯU TIÊN"
      ? "priority-high"
      : "priority-normal";
export function PriorityBadge({ value }: { value: string }) {
  return (
    <span className={`priority-badge ${priorityClass(value)}`}>{value}</span>
  );
}
