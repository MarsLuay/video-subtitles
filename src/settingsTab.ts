import { Platform, PluginSettingTab, Setting } from "obsidian";
import type { VideoSubtitlesHost } from "./pluginHost";
import {
  ACCURACY_LABELS,
  DEFAULT_SETTINGS,
  LANGUAGE_LABELS,
  MAX_SPEAKERS,
  TRANSCRIBER_ACCURACY,
  TRANSCRIBER_LANGUAGE,
  clampCueOpacity,
  isMaxSpeakers,
  isTranscriberAccuracy,
  isTranscriberLanguage
} from "./settings";
import { vaultVideoFiles } from "./transcribe/batch";
import { pickAccuracyForHardware } from "./transcribe/hardware";
import { readHardware } from "./transcribe/node";
import { paintBatchProgress } from "./ui/batchProgress";

export type SettingsHost = VideoSubtitlesHost;

export class VideoSubtitlesSettingTab extends PluginSettingTab {
  private unsubscribe: (() => void) | null = null;
  private progressEl: HTMLElement | null = null;
  private opacitySettingEl: HTMLElement | null = null;
  private processButton: {
    setButtonText: (value: string) => unknown;
    setDisabled: (disabled: boolean) => unknown;
  } | null = null;
  private localStatus = "";

  constructor(
    app: ConstructorParameters<typeof PluginSettingTab>[0],
    private readonly host: SettingsHost
  ) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.unsubscribe?.();
    this.progressEl = null;
    this.opacitySettingEl = null;
    this.processButton = null;
    for (const def of this.getSettingDefinitions()) {
      const setting = new Setting(containerEl).setName(def.name);
      if ("desc" in def && typeof def.desc === "string") setting.setDesc(def.desc);
      def.render(setting);
    }
    this.unsubscribe = this.host.createQueue.subscribe(() => this.paintProgress());
    this.paintProgress();
  }

  hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.progressEl = null;
    this.opacitySettingEl = null;
    super.hide();
  }

  getSettingDefinitions() {
    return [
      {
        name: "Transparent background",
        desc: "Show cues as text only, with no black bar. On by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.transparentBackground).onChange(async (value) => {
              this.host.subtitleSettings.transparentBackground = value;
              this.syncOpacitySetting();
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Text opacity",
        desc: "How solid the cue text is.",
        render: (setting: Setting) => {
          this.opacitySettingEl = setting.settingEl;
          this.syncOpacitySetting();
          setting.addSlider((slider) => {
            slider
              .setLimits(0, 100, 1)
              .setValue(this.host.subtitleSettings.cueOpacity)
              .setInstant(true)
              .onChange(async (value) => {
                this.host.subtitleSettings.cueOpacity = clampCueOpacity(value);
                await this.host.saveSettings();
              });
          });
        }
      },
      {
        name: "Keep transcriber",
        desc: "Keep the downloaded transcriber so creating subtitles does not fetch it again. Turned on by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.keepTranscriber ?? DEFAULT_SETTINGS.keepTranscriber).onChange(async (value) => {
              this.host.subtitleSettings.keepTranscriber = value;
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Choose Create range",
        desc: "Ask for a start and end time when you press Create. Off by default transcribes the whole video.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.chooseCreateRange).onChange(async (value) => {
              this.host.subtitleSettings.chooseCreateRange = value;
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Transcriber accuracy",
        desc: "Whisper size. The first desktop start picks one from this computer. Later changes are kept.",
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) => {
            for (const accuracy of TRANSCRIBER_ACCURACY) {
              dropdown.addOption(accuracy, ACCURACY_LABELS[accuracy]);
            }
            dropdown.setValue(this.host.subtitleSettings.transcriberAccuracy).onChange(async (value) => {
              if (!isTranscriberAccuracy(value)) return;
              this.host.subtitleSettings.transcriberAccuracy = value;
              this.host.subtitleSettings.accuracyInitialized = true;
              await this.host.saveSettings();
            });
          });
        }
      },
      {
        name: "Language",
        desc: "Force a spoken language for Create, or let Whisper detect it.",
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) => {
            for (const language of TRANSCRIBER_LANGUAGE) {
              dropdown.addOption(language, LANGUAGE_LABELS[language]);
            }
            dropdown.setValue(this.host.subtitleSettings.transcriberLanguage).onChange(async (value) => {
              if (!isTranscriberLanguage(value)) return;
              this.host.subtitleSettings.transcriberLanguage = value;
              await this.host.saveSettings();
            });
          });
        }
      },
      {
        name: "Translate to English",
        desc: "Create English cues from other languages. Off by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.translateToEnglish).onChange(async (value) => {
              this.host.subtitleSettings.translateToEnglish = value;
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Word timestamps",
        desc: "Split generated cues on words instead of phrases. Off by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.wordTimestamps).onChange(async (value) => {
              this.host.subtitleSettings.wordTimestamps = value;
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Diarization",
        desc: "Label speakers on generated cues from the local audio. Off by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.diarization).onChange(async (value) => {
              this.host.subtitleSettings.diarization = value;
              await this.host.saveSettings();
            })
          );
        }
      },
      {
        name: "Max speakers",
        desc: "How many speakers to label when diarization is on.",
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) => {
            for (const count of MAX_SPEAKERS) {
              dropdown.addOption(String(count), String(count));
            }
            dropdown.setValue(String(this.host.subtitleSettings.maxSpeakers)).onChange(async (value) => {
              const parsed = Number(value);
              if (!isMaxSpeakers(parsed)) return;
              this.host.subtitleSettings.maxSpeakers = parsed;
              await this.host.saveSettings();
            });
          });
        }
      },
      {
        name: "Process all videos",
        desc: "Transcribe every video in the vault. This can take a long time.",
        render: (setting: Setting) => {
          setting.settingEl.addClass("video-subtitles-process-all");
          setting.addButton((button) => {
            this.processButton = button;
            button.setButtonText("Process all videos").onClick(() => {
              void this.startBatch();
            });
          });
          this.progressEl = setting.settingEl.createDiv({ cls: "video-subtitles-batch-progress" });
        }
      }
    ];
  }

  private syncOpacitySetting(): void {
    this.opacitySettingEl?.toggleClass(
      "video-subtitles-setting-hidden",
      !this.host.subtitleSettings.transparentBackground
    );
  }

  private paintProgress(): void {
    const snapshot = this.host.createQueue.snapshot();
    if (this.processButton) {
      this.processButton.setDisabled(snapshot.running);
      this.processButton.setButtonText(snapshot.running ? "Processing…" : "Process all videos");
    }
    if (!this.progressEl) return;
    if (this.localStatus && !snapshot.running) {
      this.progressEl.empty();
      this.progressEl.createDiv({ cls: "video-subtitles-batch-label", text: this.localStatus });
      return;
    }
    paintBatchProgress(this.progressEl, snapshot);
  }

  private async startBatch(): Promise<void> {
    if (!Platform.isDesktopApp) {
      this.localStatus = "Creating subtitles needs desktop Obsidian.";
      this.paintProgress();
      return;
    }
    if (this.host.createQueue.running) {
      this.paintProgress();
      return;
    }
    const files = vaultVideoFiles(this.app.vault.getFiles());
    if (files.length === 0) {
      this.localStatus = "No videos in the vault.";
      this.paintProgress();
      return;
    }
    this.localStatus = "";
    if (!this.host.subtitleSettings.accuracyInitialized) {
      try {
        this.host.subtitleSettings.transcriberAccuracy = pickAccuracyForHardware(readHardware());
        this.host.subtitleSettings.accuracyInitialized = true;
        await this.host.saveSettings();
      } catch (error) {
        console.error(error);
      }
    }
    this.host.createQueue.start(files, true);
  }
}
