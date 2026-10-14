import { useState } from "react";
import { Cloud, Eye, EyeOff } from "lucide-react";
import {
  Button,
  FakeSwitch,
  Input,
  SectionCard,
  Select2,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useTranslation,
  type HostEditorSectionProps,
} from "@termix-ssh/plugin-sdk/frontend";

const PLUGIN_ID = "ssh-terminal";

type HostPluginSettings = Record<string, Record<string, unknown>>;

export function HostCloudflareTunnelSettings({
  form,
  updateForm,
}: Pick<HostEditorSectionProps, "form" | "updateForm" | "host">) {
  const { t } = useTranslation();
  const [showSecret, setShowSecret] = useState(false);

  const stored = ((form?.pluginSettings as HostPluginSettings)?.[PLUGIN_ID] ??
    {}) as Record<string, unknown>;

  const enabled = stored.cloudflareTunnelEnabled === true;
  const hostname = (stored.cloudflareTunnelHostname as string) || "";
  const port =
    typeof stored.cloudflareTunnelPort === "number"
      ? stored.cloudflareTunnelPort
      : 443;
  const clientId = (stored.cloudflareTunnelClientId as string) || "";
  const clientSecret = (stored.cloudflareTunnelClientSecret as string) || "";
  const mode = (stored.cloudflareTunnelMode as string) || "websocket";

  const write = (values: Record<string, unknown>) =>
    updateForm((current) => {
      const all = (current.pluginSettings ?? {}) as HostPluginSettings;
      return {
        ...current,
        pluginSettings: {
          ...all,
          [PLUGIN_ID]: { ...(all[PLUGIN_ID] ?? {}), ...values },
        },
      };
    });

  return (
    <SectionCard
      title={t(
        "terminal.cloudflareTunnelTitle",
        "Cloudflare Tunnel (Zero Trust)",
      )}
      icon={<Cloud className="size-3.5" />}
    >
      <SettingRow
        label={t("terminal.enableCloudflareTunnel", "Enable Cloudflare Tunnel")}
        description={t(
          "terminal.enableCloudflareTunnelDesc",
          "Route SSH traffic through Cloudflare Zero Trust instead of direct TCP sockets.",
        )}
      >
        <FakeSwitch
          checked={enabled}
          onChange={(checked) => write({ cloudflareTunnelEnabled: checked })}
        />
      </SettingRow>

      {enabled && (
        <>
          <SettingRow
            label={t("terminal.cloudflareTunnelHostname", "Tunnel Hostname")}
            description={t(
              "terminal.cloudflareTunnelHostnameDesc",
              "Public domain routed to your SSH origin service in Cloudflare Tunnel (leave empty to use the host's main address).",
            )}
          >
            <Input
              value={hostname}
              onChange={(e) =>
                write({ cloudflareTunnelHostname: e.target.value })
              }
              placeholder={String(form.ip || "e.g. ssh.example.com")}
              className="max-w-xs"
            />
          </SettingRow>

          <SettingRow
            label={t("terminal.cloudflareTunnelPort", "Tunnel Port")}
            description={t(
              "terminal.cloudflareTunnelPortDesc",
              "Edge HTTPS/WSS port on Cloudflare (default is 443).",
            )}
          >
            <Input
              type="number"
              value={port}
              onChange={(e) =>
                write({
                  cloudflareTunnelPort: e.target.value
                    ? Number(e.target.value)
                    : 443,
                })
              }
              placeholder="443"
              className="max-w-xs"
            />
          </SettingRow>

          <SettingRow
            label={t("terminal.cloudflareTunnelMode", "Transport Mode")}
            description={t(
              "terminal.cloudflareTunnelModeDesc",
              "Native WebSocket requires no external dependencies. cloudflared CLI uses the local binary.",
            )}
          >
            <Select2
              value={mode}
              onChange={(e) => write({ cloudflareTunnelMode: e.target.value })}
              className="max-w-xs"
            >
              <option value="websocket">
                {t(
                  "terminal.cloudflareModeWebsocket",
                  "Native WebSocket (Recommended)",
                )}
              </option>
              <option value="cloudflared">
                {t("terminal.cloudflareModeCli", "cloudflared CLI binary")}
              </option>
            </Select2>
          </SettingRow>

          <SettingRow
            label={t(
              "terminal.cloudflareTunnelClientId",
              "Service Token Client ID",
            )}
            description={t(
              "terminal.cloudflareTunnelClientIdDesc",
              "Optional CF-Access-Client-Id header. Required only if Cloudflare Access Zero Trust policy enforces Service Tokens.",
            )}
          >
            <Input
              value={clientId}
              onChange={(e) =>
                write({ cloudflareTunnelClientId: e.target.value })
              }
              placeholder="e.g. xxxxxxxx.access"
              className="max-w-xs"
            />
          </SettingRow>

          <SettingRow
            label={t(
              "terminal.cloudflareTunnelClientSecret",
              "Service Token Client Secret",
            )}
            description={t(
              "terminal.cloudflareTunnelClientSecretDesc",
              "Optional CF-Access-Client-Secret header for Cloudflare Access authentication.",
            )}
          >
            <div className="relative flex max-w-xs items-center">
              <Input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) =>
                  write({ cloudflareTunnelClientSecret: e.target.value })
                }
                placeholder="Optional Service Token Secret"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowSecret((prev) => !prev)}
                className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </SettingRow>
        </>
      )}
    </SectionCard>
  );
}
