export const firebaseWebConfig = {
  staging: {
    PUBLIC_FIREBASE_API_KEY: "AIzaSyBHXAM0ixV2iCWD_dE2rN-SHKS2W2Ay2z0",
    PUBLIC_FIREBASE_AUTH_DOMAIN: "bebras-bo-staging.firebaseapp.com",
    PUBLIC_FIREBASE_PROJECT_ID: "bebras-bo-staging",
    PUBLIC_FIREBASE_APP_ID: "1:88239195646:web:044edbc9ca41c429286caf",
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "88239195646",
  },
  production: {
    PUBLIC_FIREBASE_API_KEY: "AIzaSyCgEF_MekXH2WfuRVkwcWex__IfafBAGKs",
    PUBLIC_FIREBASE_AUTH_DOMAIN: "bebras-bo.firebaseapp.com",
    PUBLIC_FIREBASE_PROJECT_ID: "bebras-bo",
    PUBLIC_FIREBASE_APP_ID: "1:1026208753397:web:652dd936ef213b6bab87bc",
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1026208753397",
  },
} as const;
