// Automatically uses localhost during local dev (running `func start` + opening index.html
// directly, or via a local dev server), and the deployed Function App URL once served from the
// Static Web App. This means nobody on the team has to remember to edit this file before deploying —
// it switches on its own based on where the page is being loaded from.
//
// If you had to use the fallback Function App name (ticketing-func-team01) because the primary
// name was taken, change the URL below to match — this is the ONE place in the frontend that
// needs manual updating if you're on the fallback name.
const API_BASE =
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:7071/api"
    : "https://ticketing-func-team-d0f9hnchgcgdbbhw.centralus-01.azurewebsites.net/api";

