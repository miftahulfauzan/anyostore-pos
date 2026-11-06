# Android release signing

All release APKs must use the same private signing key so Android can install
future versions over the existing app. Never commit the keystore, password, or
the local signing properties file.

## Local builds

The release keystore and its local properties live under `~/.android/`:

- `anyostore-release.jks`
- `anyostore-release.properties`
- `anyostore-release-password`

The local properties file is restricted to the current user. Build with
`cd mobile && flutter build apk --release`.

## GitHub Actions

Add these repository Actions secrets to `miftahulfauzan/anyostore-pos`:

- `ANDROID_KEYSTORE_BASE64`: the release keystore encoded as one base64 line
- `ANDROID_KEYSTORE_PASSWORD`: the keystore and signing key password

After GitHub CLI is installed and authenticated, add them without printing the
secret values using `scripts/android/set-github-signing-secrets.sh`. The mobile
workflow decodes the keystore into the runner's temporary directory, signs the
APK, then discards the runner. It fails with a clear message if either secret
is missing.

## Updating the app

Increase the build number after `+` in `mobile/pubspec.yaml` for every release.
The first APK signed with this permanent release key may require one uninstall
if the installed APK was signed with a different debug key. Install this
release-signed APK once; subsequent builds with this key can update in place.
