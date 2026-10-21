"use client";

import { useCallback, useEffect, useState, type TransitionStartFunction } from "react";
import type { useRouter } from "next/navigation";
import { downloadOfflineCheckInRoster, syncOfflineCheckIns } from "@/app/actions/checkin";
import {
  getOfflineRoster,
  getPendingOfflineCheckIns,
  removeOfflineRoster,
  removeQueuedOfflineCheckIns,
  saveOfflineRoster,
  type OfflineRoster,
} from "@/lib/offline-checkin.client";
import type { useToast } from "@/components/feedback/ToastProvider";

/** The dashboard desk's offline roster, sync queue and connection state. Stations stay online-only. */
export function useOfflineCheckIn({
  organisationSlug,
  eventId,
  stationMode,
  router,
  showToast,
  startTransition,
}: {
  organisationSlug: string;
  eventId: string;
  stationMode: boolean;
  router: ReturnType<typeof useRouter>;
  showToast: ReturnType<typeof useToast>["showToast"];
  startTransition: TransitionStartFunction;
}) {
  const [offlineRoster, setOfflineRoster] = useState<OfflineRoster | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  const refreshOfflineState = useCallback(async () => {
    if (stationMode) return;
    const [roster, pendingCheckIns] = await Promise.all([
      getOfflineRoster(eventId),
      getPendingOfflineCheckIns(eventId),
    ]);
    setOfflineRoster(roster ?? null);
    setQueuedCount(pendingCheckIns.length);
  }, [eventId, stationMode]);

  useEffect(() => {
    if (stationMode) return;
    const initialOfflineState = window.setTimeout(() => {
      void refreshOfflineState();
    }, 0);
    const initialStatus = window.setTimeout(() => setIsOnline(navigator.onLine), 0);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(initialStatus);
      window.clearTimeout(initialOfflineState);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshOfflineState, stationMode]);

  useEffect(() => {
    // Turbopack's development chunks are replaced frequently and must never be
    // controlled by the offline worker. The worker is only an event-day
    // production feature for the check-in dashboard.
    if (stationMode || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/dashboard/", updateViaCache: "none" }).catch(() => {
      // Offline data remains available even if the browser disallows service workers.
    });
  }, [stationMode]);

  const downloadOfflineRoster = useCallback(() => {
    startTransition(async () => {
      if (!navigator.onLine) {
        showToast("Connect to the internet to download the attendee roster.", "warning");
        return;
      }
      const res = await downloadOfflineCheckInRoster({ organisationSlug, eventId });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const roster: OfflineRoster = {
        eventId,
        ...res.data!,
        // Attendee data and bearer ticket tokens must not persist on a shared
        // device beyond the event-day operational window.
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      };
      await saveOfflineRoster(roster);
      await refreshOfflineState();
      showToast("Offline roster saved to this device.", "success");
    });
  }, [eventId, organisationSlug, refreshOfflineState, showToast, startTransition]);

  const syncOfflineQueue = useCallback(() => {
    startTransition(async () => {
      if (!navigator.onLine) {
        showToast("You are offline. Check-ins will sync when connected.", "warning");
        return;
      }
      const pendingCheckIns = await getPendingOfflineCheckIns(eventId);
      if (pendingCheckIns.length === 0) return;
      const res = await syncOfflineCheckIns({
        organisationSlug,
        eventId,
        checkIns: pendingCheckIns.map(({ rsvpId, id, checkedInAt, force }) => ({
          rsvpId,
          clientMutationId: id,
          checkedInAt,
          force,
        })),
      });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      // The server has answered for every entry. Rejected ones (status changed,
      // outside the event window, removed) can never sync, so they leave the
      // queue too; otherwise the device could never sync or clear its data.
      const answeredRsvpIds = new Set([
        ...res.data!.syncedIds,
        ...res.data!.alreadyCheckedInIds,
        ...res.data!.failed.map((item) => item.rsvpId),
      ]);
      await removeQueuedOfflineCheckIns(
        pendingCheckIns.filter((item) => answeredRsvpIds.has(item.rsvpId)).map((item) => item.id),
      );
      const failed = res.data!.failed;
      const roster = failed.length > 0 ? await getOfflineRoster(eventId) : undefined;
      if (roster) {
        // This device marked them checked in; the server didn't, so undo that locally.
        const failedIds = new Set(failed.map((item) => item.rsvpId));
        await saveOfflineRoster({ ...roster, rows: roster.rows.map((row) => (failedIds.has(row.rsvpId) ? { ...row, checkedInAt: null } : row)) });
      }
      await refreshOfflineState();
      router.refresh();
      if (failed.length > 0) {
        const first = failed[0]!;
        const name = roster?.rows.find((row) => row.rsvpId === first.rsvpId)?.displayName ?? "An attendee";
        const more = failed.length > 1 ? ` and ${failed.length - 1} more` : "";
        showToast(`Not checked in: ${name}${more}. ${first.error}`, "warning");
      } else {
        showToast("Offline check-ins synced.", "success");
      }
    });
  }, [eventId, organisationSlug, refreshOfflineState, router, showToast, startTransition]);

  const clearOfflineRoster = useCallback(() => {
    startTransition(async () => {
      if (queuedCount > 0) {
        showToast("Sync pending check-ins before removing offline attendee data.", "warning");
        return;
      }
      await removeOfflineRoster(eventId);
      await refreshOfflineState();
      showToast("Offline attendee data removed from this device.", "success");
    });
  }, [eventId, queuedCount, refreshOfflineState, showToast, startTransition]);

  useEffect(() => {
    if (!stationMode && isOnline && queuedCount > 0) syncOfflineQueue();
  }, [isOnline, queuedCount, stationMode, syncOfflineQueue]);

  return { offlineRoster, queuedCount, isOnline, refreshOfflineState, downloadOfflineRoster, syncOfflineQueue, clearOfflineRoster };
}
