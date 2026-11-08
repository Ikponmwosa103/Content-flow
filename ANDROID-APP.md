# ContentFlow AI Android app

The Android app is a Capacitor shell around the live ContentFlow AI web application.

## Online architecture

- The installed APK opens the production frontend at https://content-flow.jaywebdeveloper3.workers.dev.
- The frontend continues to call the existing Render API.
- Clerk remains responsible for sign-in and sessions.
- Gemini image generation remains on the API server. Keep GEMINI_API_KEY on the server; never add it to the Android app.
- Existing hosted database, plans, quotas, billing, and user records remain online. Installing the APK does not create a second database or local account.

A network connection is required. This is not an offline app.

## Build an installable debug APK

1. Push this branch to GitHub.
2. Open the repository's Actions tab.
3. Select **Build ContentFlow Android APK**.
4. Select **Run workflow** and choose this branch.
5. When the workflow finishes, download the **ContentFlow-AI-Android-APK** artifact and extract app-debug.apk.
6. Transfer the APK to the Android phone and install it. Android may ask you to allow installation from that file manager/browser.

The workflow generates the native Android project and builds the APK on GitHub Actions; generated Gradle files are not committed to the source branch.

## Release APK

The workflow currently creates a debug APK for direct testing. A Play Store or signed release APK/AAB needs a private Android signing key and signing secrets. Do not commit keystores or passwords to this repository.
