import type { ContinuationReservation, GoalRecord, GoalStore } from "./types.js";

export class MemoryGoalStore implements GoalStore {
  private goals = new Map<string, GoalRecord>();
  private reservations = new Map<string, ContinuationReservation>();

  async getCurrentGoal(sessionKey: string): Promise<GoalRecord | undefined> {
    const goal = this.goals.get(sessionKey);
    return goal ? { ...goal } : undefined;
  }

  async saveGoal(goal: GoalRecord): Promise<void> {
    this.goals.set(goal.sessionKey, { ...goal });
  }

  async clearGoal(sessionKey: string): Promise<void> {
    this.goals.delete(sessionKey);
    this.reservations.delete(sessionKey);
  }

  async getReservation(sessionKey: string): Promise<ContinuationReservation | undefined> {
    const reservation = this.reservations.get(sessionKey);
    return reservation ? { ...reservation } : undefined;
  }

  async saveReservation(reservation: ContinuationReservation): Promise<void> {
    this.reservations.set(reservation.sessionKey, { ...reservation });
  }

  async clearReservation(sessionKey: string): Promise<void> {
    this.reservations.delete(sessionKey);
  }

  async clearExpiredReservations(now = new Date()): Promise<number> {
    let cleared = 0;
    for (const [sessionKey, reservation] of this.reservations.entries()) {
      if (new Date(reservation.expiresAt).getTime() <= now.getTime()) {
        this.reservations.delete(sessionKey);
        cleared += 1;
      }
    }
    return cleared;
  }
}
