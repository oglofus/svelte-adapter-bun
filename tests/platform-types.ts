// Compile-only regression: existing hooks may upgrade without connection data.
import '../ambient.js';

declare const platform: App.Platform;
function legacyUpgrade() {
  return platform.server.upgrade(platform.request);
}
function upgradeWithData() {
  return platform.upgrade({ data: { userId: 'example' } });
}
void legacyUpgrade;
void upgradeWithData;
