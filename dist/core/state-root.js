import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
const DEFAULT_STATE_DIR_NAME = "goal-runner";
const LEGACY_STATE_DIR_NAME = "agent-goal-runtime";
export function resolveDefaultStateRoot(explicitStateRoot) {
    if (explicitStateRoot)
        return resolve(expandHome(explicitStateRoot));
    if (process.env.AGENT_GOAL_STATE_HOME)
        return resolve(expandHome(process.env.AGENT_GOAL_STATE_HOME));
    if (process.env.XDG_STATE_HOME)
        return resolveStateRootWithLegacy(process.env.XDG_STATE_HOME);
    return resolveStateRootWithLegacy(resolve(homedir(), ".local", "state"));
}
function resolveStateRootWithLegacy(baseDir) {
    const nextRoot = resolve(baseDir, DEFAULT_STATE_DIR_NAME);
    const legacyRoot = resolve(baseDir, LEGACY_STATE_DIR_NAME);
    if (!existsSync(nextRoot) && existsSync(legacyRoot))
        return legacyRoot;
    return nextRoot;
}
function expandHome(path) {
    if (path === "~")
        return homedir();
    if (path.startsWith("~/"))
        return resolve(homedir(), path.slice(2));
    return path;
}
//# sourceMappingURL=state-root.js.map