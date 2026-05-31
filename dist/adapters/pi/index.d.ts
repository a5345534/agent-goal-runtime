import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type GoalRecord } from "../../core/index.js";
export default function goalPiExtension(pi: ExtensionAPI): void;
export declare function readPiAssistantTokenTotalFromEntries(entries: Array<Record<string, unknown>>): number;
export declare function normalizePiAssistantUsage(usage: unknown): number;
interface GoalContinuationMetadata {
    goalId: string;
    goalUpdatedAt?: string;
    attemptId?: string;
}
export declare function extractGoalContinuationMetadataFromText(content: unknown): GoalContinuationMetadata | undefined;
export declare function rewriteQueuedGoalContinuationMessages(messages: Array<Record<string, unknown>>, goal: GoalRecord | undefined): {
    messages: Array<Record<string, unknown>>;
    changed: boolean;
};
export {};
