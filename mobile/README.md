# addredance mobile

Native iOS and Android client for the addredance attendance app.

## Run locally on Windows PowerShell

PowerShell may block the `npm.ps1` and `npx.ps1` shims. Use the Windows command files explicitly:

```powershell
cd "C:\Users\AGYIRI SAKYI\Desktop\Atendance App\mobile"
npm.cmd install
npm.cmd exec -- expo start
```

Use the Expo CLI to open the app on a simulator or a physical device. Camera scanning requires a development build or a physical device.

You can also run the package scripts without `npx`:

```powershell
npm.cmd run start
npm.cmd run android
npm.cmd run ios
```

## Release builds

Install EAS CLI, then configure the project:

```powershell
npm.cmd install --global eas-cli
eas.cmd login
eas.cmd build:configure
eas.cmd build --platform all
```

The mobile client keeps the existing Google Apps Script API and employee login contract. The web app remains available while the native app is rolled out.
