// Mapping of color names to Tailwind background classes
export const agentColorMap: Record<string, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  cyan: "bg-cyan-500",
};

// Get the Tailwind class for a color, with fallback
export function getAgentColorClass(color?: string): string | undefined {
  if (!color) return undefined;

  // Normalize color to lowercase
  const normalizedColor = color.toLowerCase().trim();

  // Return the mapped class or undefined if not found
  return agentColorMap[normalizedColor];
}
