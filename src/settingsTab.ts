import { PluginSettingTab, Setting, type Plugin } from "obsidian";
import {
  ACCURACY_LABELS,
  TRANSCRIBER_ACCURACY,
  isTranscriberAccuracy,
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
      }
    ];
  }
}
