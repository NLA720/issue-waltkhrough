require("dotenv").config();

const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { AuthenticationClient, Scopes, ResponseType } = require('@aps_sdk/authentication');
const { DataManagementClient } = require('@aps_sdk/data-management');

const localStorage = require("localStorage");
const APS = require("forge-apis");
const axios = require("axios");
const sdkManager = SdkManagerBuilder.create().build();
const authenticationClient = new AuthenticationClient(sdkManager);
const dataManagementClient = new DataManagementClient(sdkManager);
const { ACCESS_TOKEN, 
        EXPIRES_IN, 
        REFRESH_TOKEN, 
        APP_BASE_URL, 
        SSA_CLIENT_ID, 
        SSA_SECRET_ID,
        SSA_SERVICE_ACCOUNT_ID,
        SSA_KEY_ID,
        SSA_PRIVATE_KEY
       } = process.env;
const {
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_CALLBACK_URL,
  INTERNAL_TOKEN_SCOPES,
  PUBLIC_TOKEN_SCOPES,
} = require("../../config");

const internalAuthClient = new APS.AuthClientThreeLegged(
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_CALLBACK_URL,
  INTERNAL_TOKEN_SCOPES
);
const publicAuthClient = new APS.AuthClientThreeLegged(
  APS_CLIENT_ID,
  APS_CLIENT_SECRET,
  APS_CALLBACK_URL,
  PUBLIC_TOKEN_SCOPES
);

const service = (module.exports = {});

// service.getAuthorizationUrl = () => internalAuthClient.generateAuthUrl();

// //#region callback url
// service.authCallbackMiddleware = async (req, res, next) => {
//   const internalCredentials = await internalAuthClient.getToken(req.query.code);
  
//   console.log("INTERNAL CREDS", internalCredentials);

//   const publicCredentials = await publicAuthClient.refreshToken(
//     internalCredentials
//   );

//   console.log("PUBLIC CREDS", publicCredentials);

//   // const profile = await service.getUserProfileBackend(internalCredentials.access_token);

//   // console.log("PROFILE", profile);
//   // const userId = profile.sub
//   // req.session.userid = userId;
//   req.session.public_token = publicCredentials.access_token;
//   req.session.internal_token = internalCredentials.access_token;
//   req.session.refresh_token = publicCredentials.refresh_token;

//   req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;

//   // localStorage.setItem(`${userId}_access_token`, req.session.public_token);
//   // localStorage.setItem(`${userId}_refresh_token`, publicCredentials.refresh_token);
//   // localStorage.setItem(`${userId}_expires_in`, internalCredentials.expires_in);
//   // localStorage.setItem(
//   //   `${userId}_expires_at`,
//   //   Date.now() + internalCredentials.expires_in * 1000
//   // );
  
//   //   localStorage.setItem("access_token", req.session.public_token);
//   // localStorage.setItem("refresh_token", publicCredentials.refresh_token);
//   // localStorage.setItem("expires_in", internalCredentials.expires_in);
//   // localStorage.setItem(
//   //   "expires_at",
//   //   Date.now() + internalCredentials.expires_in * 1000
//   // );
//   next();
// };


// // ! old refresh middleware
// service.authRefreshMiddleware = async (req, res, next) => {
//   //const { refresh_token, expires_at } = req.session;
//   const { userEmail } = req.params;
//   // console.log("User id", req.session.userid);
//   // console.log("From user", req.sub);

//   let refresh_token = req.headers['x-refresh-token'];
//   let expires_at = req.headers['x-expires-at'];
//   let access_token = req.headers['x-internal_token'];
//   // let expires_in = Number(localStorage.getItem("expires_in")) ?? EXPIRES_IN;


//   // let refresh_token = localStorage.getItem("refresh_token") ?? REFRESH_TOKEN;
//   // let expires_at =
//   //   Number(localStorage.getItem("expires_at")) ??
//   //   Date.now() + EXPIRES_IN * 1000;
//   // let access_token = localStorage.getItem("access_token") ?? ACCESS_TOKEN;
//   // let expires_in = Number(localStorage.getItem("expires_in")) ?? EXPIRES_IN;

//   // const userId = req.session.userid;
//   // let refresh_token = localStorage.getItem(`${userId}_refresh_token`);
//   // let expires_at =
//   //   Number(localStorage.getItem(`${userId}_expires_at`)) ??
//   //   Date.now() + EXPIRES_IN * 1000;
//   // let access_token = localStorage.getItem(`${userId}_access_token`);
//   // let expires_in = Number(localStorage.getItem(`${userId}_expires_in`));


//   if (!refresh_token) {
//     // refresh_token = REFRESH_TOKEN;
//     // expires_at = Date.now() + expires_in * 100000;

//     // req.session.public_token = access_token;
//     // req.session.internal_token = access_token;
//     // req.session.refresh_token = refresh_token;
//     // req.session.expires_at = expires_at;
//     res.status(401).end();
//     return;
//   }

//   //console.log("Refresh Token", refresh_token, expires_at);
//   if (expires_at < Date.now()) {
//     const internalCredentials = await internalAuthClient.refreshToken({
//       refresh_token,
//     });
//     const publicCredentials = await publicAuthClient.refreshToken(
//       internalCredentials
//     );
//     req.session.public_token = publicCredentials.access_token;
//     req.session.internal_token = internalCredentials.access_token;
//     req.session.refresh_token = publicCredentials.refresh_token;
//     req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;

//   //       localStorage.setItem("access_token", req.session.public_token);
//   // localStorage.setItem("refresh_token", publicCredentials.refresh_token);
//   // localStorage.setItem("expires_in", internalCredentials.expires_in);
//   // localStorage.setItem(
//   //   "expires_at",
//   //   Date.now() + internalCredentials.expires_in * 1000
//   // );

//     // localStorage.setItem(`${userId}_access_token`, publicCredentials.access_token);
//     // localStorage.setItem(`${userId}_refresh_token`, publicCredentials.refresh_token);
//     // localStorage.setItem(`${userId}_expires_in`, internalCredentials.expires_in);
//     // localStorage.setItem(
//     //   `${userId}_expires_at`,
//     //   Date.now() + internalCredentials.expires_in * 1000
//     // );
//   }
//   req.internalOAuthToken = {
//     access_token: req.session.internal_token ?? access_token,
//     expires_in: Math.round(
//       (req.session.expires_at ?? expires_at - Date.now()) / 1000
//     ),
//   };
//   req.publicOAuthToken = {
//     access_token: req.session.public_token ?? access_token,
//     expires_in: Math.round(
//       (req.session.expires_at ?? expires_at - Date.now()) / 1000
//     ),
//   };

//   next();
// };


// service.getUserProfile = async (token) => {
//   const resp = await new APS.UserProfileApi().getUserProfile(
//     internalAuthClient,
//     token
//   );
//   return resp.body;
// };




// service.getAuthorizationUrl = () => internalAuthClient.generateAuthUrl();

service.getAuthorizationUrl = () => authenticationClient.authorize(APS_CLIENT_ID, ResponseType.Code, APS_CALLBACK_URL, [
    Scopes.DataRead,
    Scopes.DataWrite,
    Scopes.DataCreate,
    Scopes.BucketRead,
    Scopes.BucketCreate,
    Scopes.BucketUpdate,
    Scopes.ViewablesRead,
    Scopes.AccountRead
]);

service.authCallbackMiddleware = async (req, res, next) => {
    const internalCredentials = await authenticationClient.getThreeLeggedToken(APS_CLIENT_ID, req.query.code, APS_CALLBACK_URL, {
        clientSecret: APS_CLIENT_SECRET,
        scopes: [
            Scopes.DataRead,
            Scopes.DataWrite,
            Scopes.DataCreate,
            Scopes.BucketRead,
            Scopes.BucketCreate,
            Scopes.BucketUpdate,
            Scopes.ViewablesRead,
            Scopes.AccountRead
        ]
    });
    const publicCredentials = await authenticationClient.refreshToken(internalCredentials.refresh_token, APS_CLIENT_ID, {
        clientSecret: APS_CLIENT_SECRET,
        scopes: [
            Scopes.DataRead,
            Scopes.DataWrite,
            Scopes.DataCreate,
            Scopes.BucketRead,
            Scopes.BucketCreate,
            Scopes.BucketUpdate,
            Scopes.ViewablesRead,
            Scopes.AccountRead
        ]
    });
    req.session.public_token = publicCredentials.access_token;
    req.session.internal_token = internalCredentials.access_token;
    req.session.refresh_token = publicCredentials.refresh_token;
    // req.session.expires_at = internalCredentials.expires_in;
    req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
    console.log("Internal Token in callback middleware:", req.session.internal_token);
    console.log("Public Token in callback middleware:", req.session.public_token);
    console.log("Refresh Token in callback middleware:", req.session.refresh_token);
    console.log("Expires at in callback middleware:", req.session.expires_at);
    console.log("Expires at (readable):", new Date(req.session.expires_at));
    next();
};

service.authRefreshMiddleware = async (req, res, next) => {
    console.log("=== AUTHENTICATION MIDDLEWARE CALLED ===");
    console.log("Request URL:", req.url);
    console.log("Request method:", req.method);
    console.log("Headers:", Object.keys(req.headers));
    
 // First check session
    let { refresh_token, expires_at, internal_token } = req.session;

    // if (!refresh_token && req.headers["x-refresh-token"]) {
    //   refresh_token = req.headers["x-refresh-token"];
    //   expires_at = req.headers["x-expires-at"];
    //   internal_token = req.headers["x-internal-token"];

    //   // Save them into session for next time
    //   req.session.refresh_token = refresh_token;
    //   req.session.expires_at = expires_at;
    //   req.session.internal_token = internal_token;
    //   console.log("Session hydrated from headers");
    // }

    // if (!refresh_token) {
    //   return res.status(401).end();
    // }

    refresh_token = req.headers["x-refresh-token"];
    expires_at = req.headers["x-expires-at"];
    internal_token = req.headers["x-internal-token"];
    
    console.log("Initial token values from headers:");
    console.log("refresh_token:", refresh_token ? refresh_token.substring(0, 20) + '...' : 'null');
    console.log("expires_at:", expires_at);
    console.log("internal_token:", internal_token ? internal_token.substring(0, 20) + '...' : 'null');

    // Fallback: extract token from Authorization header if other tokens are missing
    if (!internal_token) {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            internal_token = authHeader.substring(7); // Remove 'Bearer ' prefix
            console.log("Extracted token from Authorization header:", internal_token ? internal_token.substring(0, 20) + '...' : 'null');
        }
    }

    console.log("Using refresh token:", refresh_token);
    console.log("Token expires at:", expires_at, "which is", new Date(expires_at));
    console.log("Internal token exists:", !!internal_token);
    console.log(expires_at < Date.now());
    if (expires_at < Date.now()) {
        const internalCredentials = await authenticationClient.refreshToken(refresh_token, APS_CLIENT_ID, {
            clientSecret: APS_CLIENT_SECRET,
            scopes: [Scopes.DataRead, Scopes.DataCreate]
        });
        const publicCredentials = await authenticationClient.refreshToken(internalCredentials.refresh_token, APS_CLIENT_ID, {
            clientSecret: APS_CLIENT_SECRET,
            scopes: [Scopes.ViewablesRead]
        });
        req.session.public_token = publicCredentials.access_token;
        req.session.internal_token = internalCredentials.access_token;
        req.session.refresh_token = publicCredentials.refresh_token;
        req.session.expires_at = Date.now() + internalCredentials.expires_in * 1000;
    }

    req.internalOAuthToken = {
        access_token: internal_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000),
    };
    req.publicOAuthToken = {
        access_token: req.session.public_token,
        expires_in: Math.round((req.session.expires_at - Date.now()) / 1000),
    };
    next();
};

service.getUserProfile = async (accessToken) => {
    console.log("Access Token in getUserProfile:", accessToken);
    const resp = await authenticationClient.getUserInfo(accessToken);
    return resp;
};

service.getUserProfileBackend = async (token) => {
  const resp = await axios.get("https://api.userprofile.autodesk.com/userinfo", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return resp.data;
};

service.getTokens = async (email) => {
  const resp = await axios.get(`${APP_BASE_URL}/api/sqlite/token/${email}`);

  return resp;
};

service.refreshToken = async () => {};
