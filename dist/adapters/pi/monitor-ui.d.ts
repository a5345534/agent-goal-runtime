import type { GoalSummary } from "../../core/index.js";
import type { GoalListThemeLike } from "./goal-list-ui.js";
export type GoalMonitorAction = "close" | "pause" | "resume" | "clear" | "openSession";
export interface GoalMonitorSelection {
    kind: "action" | "close";
    action?: GoalMonitorAction;
}
export declare class GoalMonitorController {
    private readonly goal;
    private buttonIndex;
    private scroll;
    constructor(goal: GoalSummary);
    get actions(): GoalMonitorAction[];
    handleInput(data: string): GoalMonitorSelection | undefined;
    render(width: number, theme: GoalListThemeLike): string[];
}
export declare function readGoalTranscriptLines(sessionFile: string | undefined): string[];
