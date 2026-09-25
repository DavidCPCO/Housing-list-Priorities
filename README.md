# Our home priorities

A static web app for two people to rank home-buying priorities and compare homes. The site can live on GitHub Pages. Firebase Authentication and Cloud Firestore keep the shared data in sync across devices.

## Set up Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/).
2. In **Project settings → Your apps**, register a **Web app** and copy its Firebase config values into `firebase-config.js`. The `measurementId` and `storageBucket` fields are not needed.
3. In **Build → Authentication → Sign-in method**, enable **Anonymous** sign-in.
4. In **Build → Firestore Database**, create a database. Choose a suitable region and select production mode. In the **Rules** tab, replace the rules with the contents of `firestore.rules` and publish them.
5. Upload `index.html`, `styles.css`, `app.js`, and `firebase-config.js` to the root of a GitHub repository. Keep `README.md` and `firestore.rules` there too for future reference.
6. In the GitHub repository, open **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, choose your main branch and `/ (root)`, and save. Open the Pages URL GitHub gives you.

On first use, click **Create our shared list**, pick **David** or **Partner**, and send the invite link to the other person. The invite link contains the shared room code. Each person should select their own name on their device. Existing priorities that the other person has listed appear in **Choose a priority already listed**. They can select one and add their own score, or create a new priority. The **Together** and **Compare homes** views update live.

## Important access detail

The random invite code controls access to a list. **Anyone with its link can view and edit the list, including changing either person's score by switching the name selector.** Do not post the invite link publicly. Firebase's web config is meant to be public and is not an access secret. If you need individual accounts or enforced permissions later, add proper sign-in and owner-specific Firestore rules.

## Scoring

- Each person gives a priority a whole-number score from **0 to 10**. A blank means they have not added it; 0 is an explicit rating.
- The combined weight is the sum of the two scores, out of 20. The difference appears when both people have rated it. One person's dealbreaker flag is enough for the shared flag.
- A home's match is `sum(priority combined weight × home rating) ÷ (10 × sum(priority combined weight))`. Home ratings are 0–10. Unrated items count as zero in the match score, and the card shows how many have been rated. Dealbreakers remain visible as flags and should be checked separately; the percentage does not override them.
- Removing a priority from your own list retains it if your partner has rated it. Removing a home also removes its ratings.

## Local preview

After configuring Firebase, serve the folder with a local HTTP server, for example `python3 -m http.server 8000`, then open `http://localhost:8000`. ES modules do not run reliably from a `file://` URL.

The app uses Firebase's modular web SDK from Google's CDN. It has no build step or package installation.
