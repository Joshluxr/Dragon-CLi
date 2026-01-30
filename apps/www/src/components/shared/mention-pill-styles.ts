import styles from "@/components/promptbox/promptbox.module.css";

// Shared mention pill style classes
export const mentionPillStyle = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-muted text-foreground hover:bg-muted hover:text-foreground cursor-default transition-colors align-baseline no-underline max-w-full truncate ${styles.mentionPill}`;

// Icon URLs as data URIs
export const fileIconUrl =
  "data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3e%3cpath%20d=%27M15%202H6a2%202%200%200%200-2%202v16a2%202%200%200%200%202%202h12a2%202%200%200%200%202-2V7Z%27/%3e%3cpath%20d=%27M14%202v4a2%202%200%200%200%202%202h4%27/%3e%3c/svg%3e";

export const folderIconUrl =
  "data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27currentColor%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3e%3cpath%20d=%27m3%207%203-3%203%203v11a1%201%200%200%201-1%201H4a1%201%200%200%201-1-1Z%27/%3e%3cpath%20d=%27M21%206H12l-2-2H4%27/%3e%3c/svg%3e";

// Link classes
export const linkClasses = "underline break-all";
