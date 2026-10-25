import {
  formatBatchCurrent,
  formatBatchOverall,
  type CreateQueueSnapshot
} from "../transcribe/batch";

function addMeter(parent: HTMLElement, label: string, percent: number): void {
  const row = parent.createDiv({ cls: "video-subtitles-batch-row" });
  row.createDiv({ cls: "video-subtitles-batch-label", text: label });
  const track = row.createDiv({ cls: "video-subtitles-progress-meter" });
  const fill = track.createDiv({ cls: "video-subtitles-progress-meter-fill" });
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

export function paintBatchProgress(host: HTMLElement, snapshot: CreateQueueSnapshot): void {
  host.empty();
  if (!snapshot.running) return;
  addMeter(
    host,
    formatBatchOverall(snapshot.completed, snapshot.total, snapshot.overallRemainingSec),
    snapshot.overallPercent
  );
  if (snapshot.currentName) {
    addMeter(
      host,
      formatBatchCurrent(
        snapshot.currentName,
        snapshot.currentPercent,
        snapshot.currentRemainingSec,
        snapshot.currentPhase
      ),
      snapshot.currentPercent
    );
  }
}
