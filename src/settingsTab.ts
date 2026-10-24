import { PluginSettingTab, Setting, type Plugin } from "obsidian";
import {
  ACCURACY_LABELS,
  LANGUAGE_LABELS,
  MAX_SPEAKERS,
  TRANSCRIBER_ACCURACY,
  TRANSCRIBER_LANGUAGE,
  isMaxSpeakers,
  isTranscriberAccuracy,
  isTranscriberLanguage,
  type VideoSubtitleSettings
} from "./settings";

export type SettingsHost = Plugin & {
  subtitleSettings: VideoSubtitleSettings;
  saveSettings: () => Promise<void>;
};

export class VideoSubtitlesSettingTab extends PluginSettingTab {
  constructor(
    app: ConstructorParameters<typeof PluginSettingTab>[0],
    private readonly host: SettingsHost
  ) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const def of this.getSettingDefinitions()) {
      const setting = new Setting(containerEl).setName(def.name);
      if ("desc" in def && typeof def.desc === "string") setting.setDesc(def.desc);
      def.render(setting);
    }
  }

  getSettingDefinitions() {
    return [
      {
        name: "Keep transcriber",
        desc: "Keep the downloaded transcriber so creating subtitles does not fetch it again. Turned on by default.",
        render: (setting: Setting) => {
          setting.addToggle((toggle) =>
            toggle.setValue(this.host.subtitleSettings.keepTranscriber).onChange(async (value) => {
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
      }
    ];
  }
}
