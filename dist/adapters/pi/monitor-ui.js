import { existsSync, readFileSync } from "node:fs";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
export class GoalMonitorController {
    goal;
    buttonIndex = 0;
    scroll = 0;
    constructor(goal) {
        this.goal = goal;
    }
    get actions() {
        const actions = [];
        if (this.goal.status === "active")
            actions.push("pause");
        if (["paused", "blocked", "budgetLimited", "usageLimited"].includes(this.goal.status))
            actions.push("resume");
        actions.push("clear");
        if (this.goal.sessionFile)
            actions.push("openSession");
        actions.push("close");
        return actions;
    }
    handleInput(data) {
        if (matchesKey(data, Key.escape))
            return { kind: "close" };
        if (matchesKey(data, Key.left)) {
            this.buttonIndex = (this.buttonIndex + this.actions.length - 1) % this.actions.length;
            return undefined;
        }
        if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
            this.buttonIndex = (this.buttonIndex + 1) % this.actions.length;
            return undefined;
        }
        if (matchesKey(data, Key.up)) {
            this.scroll = Math.max(0, this.scroll - 1);
            return undefined;
        }
        if (matchesKey(data, Key.down)) {
            this.scroll += 1;
            return undefined;
        }
        if (matchesKey(data, Key.enter)) {
            const action = this.actions[this.buttonIndex] ?? "close";
            return action === "close" ? { kind: "close" } : { kind: "action", action };
        }
        return undefined;
    }
    render(width, theme) {
        const title = theme.bold ? theme.bold(`Goal ${this.goal.shortGoalId}`) : `Goal ${this.goal.shortGoalId}`;
        const actions = this.actions
            .map((action, index) => (index === this.buttonIndex ? theme.fg("accent", `[${action}]`) : theme.fg("dim", ` ${action} `)))
            .join(" ");
        const lines = [
            truncateToWidth(`${theme.fg("accent", title)}  ${actions}`, width),
            truncateToWidth(`status=${this.goal.status}/${this.goal.activityState ?? "-"} workspace=${this.goal.executionWorkspace ?? "legacy"}`, width),
            truncateToWidth(`branch/ref=${this.goal.branch ?? this.goal.ref ?? "-"} verification=${this.goal.branchVerificationStatus ?? "unknown"}`, width),
            truncateToWidth(theme.fg("dim", "↑↓ scroll transcript • ←→/Tab action • Enter run explicit action • Esc close without mutation"), width),
            truncateToWidth(theme.fg("borderMuted", "─".repeat(Math.max(0, width))), width),
        ];
        const transcript = readGoalTranscriptLines(this.goal.sessionFile);
        if (transcript.length === 0) {
            lines.push(truncateToWidth(theme.fg("muted", "No transcript entries available"), width));
            return lines;
        }
        for (const line of transcript.slice(this.scroll, this.scroll + 30)) {
            lines.push(truncateToWidth(line, width));
        }
        return lines;
    }
}
export function readGoalTranscriptLines(sessionFile) {
    if (!sessionFile || !existsSync(sessionFile))
        return [];
    const lines = [];
    for (const rawLine of readFileSync(sessionFile, "utf8").split("\n")) {
        if (!rawLine.trim())
            continue;
        try {
            const entry = JSON.parse(rawLine);
            if (entry.type !== "message")
                continue;
            const message = entry.message;
            if (!message)
                continue;
            const role = typeof message.role === "string" ? message.role : "message";
            const text = textFromMessage(message);
            if (text)
                lines.push(`${role}: ${text}`);
        }
        catch {
            // Ignore malformed session lines; monitor is read-only and best-effort.
        }
    }
    return lines;
}
function textFromMessage(message) {
    const content = message.content;
    if (typeof content === "string")
        return content.replace(/\s+/g, " ").trim();
    if (Array.isArray(content)) {
        return content.map((part) => {
            if (typeof part === "string")
                return part;
            if (part && typeof part === "object" && "text" in part) {
                const text = part.text;
                return typeof text === "string" ? text : "";
            }
            return "";
        }).join(" ").replace(/\s+/g, " ").trim();
    }
    if (typeof message.text === "string")
        return message.text.replace(/\s+/g, " ").trim();
    return "";
}
//# sourceMappingURL=monitor-ui.js.map