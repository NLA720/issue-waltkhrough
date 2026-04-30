/// import * as Autodesk from "@types/forge-viewer";
import { createIssue_v2, getAllIssues, getIssuesFiltered } from "./issues.js";
import { getMetadata } from "./modelderivative.js";
import { getOneProject } from "./sidebar.js";
import * as viewerFunctions from "./ViewerFunctions/workset.mjs";
var viewer = null;
var pushpinData = null;
var selectedProject = null;
var selectedProjectItem = null;
var pushpinExt = null;
var pushpinIssueExt = null;
var viewerPushPinExt = null;
var issueFilter = null;
var modelCount = 0;
var loadedModelCounter = 0;
var g_projectItems = [];
var srcWin = null;
var srcOrigin = "";
var src = null;
var oneIssueDetails = null;
var modelsLoaded = 0;

// Map pushpin DOM id -> issue title (used by our tooltip overlay).
var tooltipState = globalThis.__issuePushpinTooltipState || {
  titlesById: {},
  el: null,
  rafPending: false,
  latestEvent: null,
  extensions: [],
};
globalThis.__issuePushpinTooltipState = tooltipState;

function ensureIssuePushpinTooltip() {
  if (tooltipState.el) return;

  tooltipState.el = document.createElement("div");
  tooltipState.el.id = "issue-pushpin-tooltip";
  tooltipState.el.style.cssText = [
    "position: fixed",
    "z-index: 2147483647",
    "display: none",
    "pointer-events: none",
    "background: rgba(0, 0, 0, 0.75)",
    "color: #fff",
    "padding: 6px 8px",
    "border-radius: 4px",
    "font-size: 12px",
    "font-family: Arial, sans-serif",
    "max-width: 320px",
    "white-space: nowrap",
    "overflow: hidden",
    "text-overflow: ellipsis",
  ].join(";");

  document.body.appendChild(tooltipState.el);

  const hideTooltip = () => {
    if (!tooltipState.el) return;
    tooltipState.el.style.display = "none";
  };

  const update = () => {
    tooltipState.rafPending = false;
    if (!tooltipState.latestEvent) return;
    const ev = tooltipState.latestEvent;
    tooltipState.latestEvent = null;

    if (!tooltipState.titlesById || Object.keys(tooltipState.titlesById).length === 0) {
      hideTooltip();
      return;
    }

    // Most reliable path: compare mouse position to projected pushpin positions.
    // This avoids depending on overlay DOM/event behavior.
    if (viewer && typeof viewer.worldToClient === "function") {
      const maxDistPx = 14;
      const maxDistSq = maxDistPx * maxDistPx;

      for (const ext of tooltipState.extensions || []) {
        const pushpins = ext?.pushPinManager?.pushPinList || [];
        for (const pin of pushpins) {
          const p = pin?.itemData?.position;
          if (!p) continue;

          const world =
            p.isVector3
              ? p
              : new THREE.Vector3(
                  Number(p.x ?? p[0] ?? 0),
                  Number(p.y ?? p[1] ?? 0),
                  Number(p.z ?? p[2] ?? 0)
                );
          const screen = viewer.worldToClient(world);
          if (!screen) continue;

          const dx = ev.clientX - screen.x;
          const dy = ev.clientY - screen.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > maxDistSq) continue;

          const pinId = pin?.itemData?.id;
          const title =
            pin?.container?.getAttribute?.("data-issue-title") ||
            pin?.itemData?.label ||
            (pinId ? tooltipState.titlesById[pinId] : null) ||
            "Issue";
          tooltipState.el.textContent = title;
          tooltipState.el.style.left = `${ev.clientX + 12}px`;
          tooltipState.el.style.top = `${ev.clientY + 12}px`;
          tooltipState.el.style.display = "block";
          return;
        }
      }
    }

    // Fallback: hit-test cursor against pushpin container bounds.
    for (const ext of tooltipState.extensions || []) {
      const pushpins = ext?.pushPinManager?.pushPinList || [];
      for (const pin of pushpins) {
        const container = pin?.container;
        if (!container) continue;
        const r = container.getBoundingClientRect();
        const isInside =
          ev.clientX >= r.left &&
          ev.clientX <= r.right &&
          ev.clientY >= r.top &&
          ev.clientY <= r.bottom;
        if (!isInside) continue;

        const pinId = pin?.itemData?.id;
        const title =
          container.getAttribute("data-issue-title") ||
          pin?.itemData?.label ||
          (pinId ? tooltipState.titlesById[pinId] : null) ||
          "Issue";
        tooltipState.el.textContent = title;
        tooltipState.el.style.left = `${ev.clientX + 12}px`;
        tooltipState.el.style.top = `${ev.clientY + 12}px`;
        tooltipState.el.style.display = "block";
        return;
      }
    }

    // In Forge Viewer, mousemove target can stay on a canvas wrapper.
    // elementFromPoint gives the real top-most DOM element under cursor.
    let el = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
    while (el && el !== document.body) {
      const explicitTitle = el.getAttribute && el.getAttribute("data-issue-title");
      if (explicitTitle) {
        tooltipState.el.textContent = explicitTitle;
        tooltipState.el.style.left = `${ev.clientX + 12}px`;
        tooltipState.el.style.top = `${ev.clientY + 12}px`;
        tooltipState.el.style.display = "block";
        return;
      }

      if (el.id && tooltipState.titlesById[el.id]) {
        const title = tooltipState.titlesById[el.id];
        tooltipState.el.textContent = title;
        tooltipState.el.style.left = `${ev.clientX + 12}px`;
        tooltipState.el.style.top = `${ev.clientY + 12}px`;
        tooltipState.el.style.display = "block";
        return;
      }
      el = el.parentElement;
    }

    hideTooltip();
  };

  document.addEventListener(
    "mousemove",
    (ev) => {
      tooltipState.latestEvent = ev;
      if (tooltipState.rafPending) return;
      tooltipState.rafPending = true;
      window.requestAnimationFrame(update);
    },
    { passive: true }
  );
}

function showIssuePushpinTooltip(title, clientX, clientY) {
  ensureIssuePushpinTooltip();
  if (!tooltipState.el) return;
  tooltipState.el.textContent = title || "Issue";
  tooltipState.el.style.left = `${clientX + 12}px`;
  tooltipState.el.style.top = `${clientY + 12}px`;
  tooltipState.el.style.display = "block";
}

function hideIssuePushpinTooltip() {
  if (!tooltipState.el) return;
  tooltipState.el.style.display = "none";
}

function syncPushpinContainerTitles(extension) {
  const pushpins = extension?.pushPinManager?.pushPinList || [];
  pushpins.forEach((pin) => {
    const pinId = pin?.itemData?.id;
    
    // Create enhanced hover title with level information
    const baseTitle = pin?.itemData?.label || (pinId ? tooltipState.titlesById[pinId] : null) || "Issue";
    const hoverTitle = pin?.itemData?.level && window.availableLevels ? 
      `${baseTitle} - Level: ${window.availableLevels.find(l => l.id === pin?.itemData?.level)?.name || 'Unknown'}` :
      baseTitle;
    
    if (pinId) tooltipState.titlesById[pinId] = hoverTitle;

    const container = pin?.container;
    if (!container) return;

    container.setAttribute("data-issue-title", hoverTitle);
    container.setAttribute("title", hoverTitle);
    container.setAttribute("aria-label", hoverTitle);

    if (!container.__issueHoverBound) {
      container.__issueHoverBound = true;
      container.addEventListener("mouseenter", (ev) => {
        const t = container.getAttribute("data-issue-title") || hoverTitle;
        showIssuePushpinTooltip(t, ev.clientX, ev.clientY);
      });
      container.addEventListener("mousemove", (ev) => {
        const t = container.getAttribute("data-issue-title") || hoverTitle;
        showIssuePushpinTooltip(t, ev.clientX, ev.clientY);
      });
      container.addEventListener("mouseleave", () => {
        hideIssuePushpinTooltip();
      });
    }

    container.querySelectorAll("*").forEach((el) => {
      el.setAttribute("data-issue-title", hoverTitle);
      el.setAttribute("title", hoverTitle);
      el.setAttribute("aria-label", hoverTitle);
    });
  });
}

const params = new URLSearchParams(window.location.search);
const userGuid = params.get("userGuid");
const deviceType = params.get("deviceType");
const newGuid = params.get("newGuid");
const hardAsset = params.get("hardAsset");
const functionalLocation = params.get("floc");


const modelSetViews = [
  // {
  //   containerId: "bd676732-fbaf-4f1e-bd70-35268dbb216c",
  //   definition: [
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:4b04FjlWQ1a2OzXiLry9qQ",
  //       viewableName: "DB8-SEMY-ARST-ASBUILT",
  //     },
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:xCLLbKXaTJugWRJKyXn3lA",
  //       viewableName: "DB8-SEMY-P41-ASBUILT",
  //     },
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:s8kRPfTvTHSCSk3zORE9-w",
  //       viewableName: "DB8-SEMY-SITE-ASBUILT",
  //     },
  //   ],
  // },


    // published folder test model
  {
    containerId: "bd676732-fbaf-4f1e-bd70-35268dbb216c",
    "definition": [
                {
                    "lineageUrn": "urn:adsk.wipemea:dm.lineage:_vmIwVi4R0aCM6DxgVIwNw",
                    "viewableName": "DB8-SEMY-ARST-ASBUILT"
                },
                {
                  "lineageUrn": "urn:adsk.wipemea:dm.lineage:sPWJFpwHRjm99xLfzTZuCw",
                  "viewableName": "DB8-SEMY-SITE-ASBUILT",
                },
                {
                  "lineageUrn": "urn:adsk.wipemea:dm.lineage:RNAEeDZJSeeCG88JyEJTrg",
                  "viewableName": "DB8-SEMY-P41-ASBUILT",
                },
    ]
  },

  {
    containerId: "90cb12d1-43a4-4360-884b-0625eab88572",
    modelSetId: "f16c5b88-5baf-44d2-827f-f91b5e525e3d",
    modelSetViewId: "8cd23fc0-17b0-4e27-899b-13ec3e1479a6",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:fdosriHoSSq4NPIIkiyvVw",
        viewableName: "SOL11-23-SEMY-ARST-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:1a6uXwpuRXykLPeEX-YFpg",
        viewableName: "SOL11-23-SEMY-P41-ASBUILT",
      },
    ],
  },

  {
    containerId: "552de2d1-bc00-41a4-8d90-ec063d64a4c6",
    modelSetId: "15054182-e125-4c29-9ec2-b106cafaf660",
    modelSetViewId: "b86d148b-2001-4874-89d4-c8e2e1b8c645",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:UwhmTaE5RQ21--nmCQd2pA",
        viewableName: "HG62-SEMY-ARST-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:Oiuj-KZlQGWHcvIe4nDKKQ",
        viewableName: "HG62-SEMY-P41-ASBUILT",
      },
    ],
  },

  {
    containerId: "bf8f603c-7e37-4367-9900-69e279377191",
    modelSetId: "c5b540bc-cd60-4fc0-8773-e75e3aeaa806",
    modelSetViewId: "652ff58a-92db-4c0d-ba67-4f8739732c8c",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:sRfOlKPITMG3zSgBoeF3Ww",
        viewableName: "SMY-DB8-xxx-SIT-R24",
      },
      {
        // urn:adsk.wipemea:dm.lineage:xdXReqV0T1azoWueEiSnzg <-- Prod
        // urn:adsk.wipemea:dm.lineage:zSzRg1lhS9uzKEXQgvbrKA <-- test
        // urn:adsk.wipemea:dm.lineage:OBZybXF9T8KxRSZK3MbA5A <-- detach
        lineageUrn: "urn:adsk.wipemea:dm.lineage:xdXReqV0T1azoWueEiSnzg",
        viewableName: "DB8-SEMY-ARST-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:cuy9_KQiSyadqUu2aI_Bsg",
        viewableName: "DB8-SEMY-P41-ASBUILT",
      },
    ],
  },

  {
    containerId: "6623a4ce-ac71-4678-af1c-55a4030ff9d9",
    modelSetId: "04b02d5f-68f3-4f99-9da4-25efc09e8732",
    modelSetViewId: "16f86a0f-5342-4217-bb9a-c07b727fdf77",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:Af_CxVQ8R9Gk7aIC2c69Rw",
        viewableName: "ODV18-SEMY-ARST-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:QlwJKiUVTzORuyDvPuGl1Q",
        viewableName: "ODV18-SEMY-P41-ASBUILT",
      },
    ],
  },

  {
    containerId: "e4cde0c5-7fd9-4974-9832-616f058478f9",
    modelSetId: "b5e38b3b-e760-44b1-95c2-699adb09654d",
    modelSetViewId: "6ae54740-0d61-46d6-bfb6-fbb0ed462798",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:q8g1LE0vQ2WO5AHJ9Kd55A",
        viewableName: "SOL10-SEMY-P41-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:gs0PRB3eRUS6ANLK09vDYA",
        viewableName: "SOL10-SEMY-ARST-ASBUILT",
      },
      // {
      //   lineageUrn: "urn:adsk.wipemea:dm.lineage:9RzMYc2xRfu3IQ8Kzf3Cpg",
      //   viewableName: "SMY-SEMY-xxx-SIT-ASBUILT-SOL10-CL",
      // }
    ],
  },
  {
    containerId: "a08e2cf9-5b5c-4254-883e-15a9fcf3cb5c",
    // modelSetId: "981d3313-3ea4-419d-9c47-3a9837ae4570",
    // modelSetViewId: "3f6d8589-bd8c-404f-b0b9-db847f90d807",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:k9jCDybIRKK0DqORUNDnrA",
        viewableName: "SEMY-SOL20-ARST-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:F5rNrMwxSOaRGKtW8iwl1g",
        viewableName: "SEMY-SOL20-MEP",
      },
    ],
  },
  {
    containerId: "1c8224f1-b860-4a2b-821b-d393c94b190d",
    modelSetId: "2cef0d71-341d-43ab-9270-30dc3a2ac6f3",
    modelSetViewId: "a77b9e61-2f7b-40aa-ac3e-575d2aab3e82",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:NsE81iHwS6inclXR2YMw_g",
        viewableName: "BS19-SEMY-P41-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:cH693J46Riyi-_ccyuHx4g",
        viewableName: "BS19-SEMY-ARST-ASBUILT",
      },
    ],
  },
  {
    containerId: "bca6a4c5-fbd8-4dcb-a637-b3713a06cc8d",
    modelSetId: "da80d29f-f7b0-4445-bf04-1b5ffeb6aa03",
    modelSetViewId: "e629ca4e-730a-49b9-82c8-6981d9ff332e",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:VLzD-rrOS9SQvV6rnJT7LA",
        viewableName: "SMY-SEMY-ARST-JV3_OCAB",
      },
      // {
      //   lineageUrn: "urn:adsk.wipemea:dm.lineage:Ty5wLZ92TqCHkIn80Mmipg",
      //   viewableName: "JV3-SEMY-P41-ASBUILT-COMMON AREAS",
      // },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:U9tz-MHvQfS2Hg9gRITkdA",
        viewableName: "JV3-SEMY-P41-ASBUILT-OCAB",
      },
    ],
  },
  {
    containerId: "1c8224f1-b860-4a2b-821b-d393c94b190d",
    modelSetId: "2cef0d71-341d-43ab-9270-30dc3a2ac6f3",
    modelSetViewId: "a77b9e61-2f7b-40aa-ac3e-575d2aab3e82",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:NsE81iHwS6inclXR2YMw_g",
        viewableName: "BS19-SEMY-P41-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:cH693J46Riyi-_ccyuHx4g",
        viewableName: "BS19-SEMY-ARST-ASBUILT",
      },
    ],
  },
  // {
  //   containerId: "bca6a4c5-fbd8-4dcb-a637-b3713a06cc8d",
  //   modelSetId: "da80d29f-f7b0-4445-bf04-1b5ffeb6aa03",
  //   modelSetViewId: "e629ca4e-730a-49b9-82c8-6981d9ff332e",
  //   definition: [
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:VLzD-rrOS9SQvV6rnJT7LA",
  //       viewableName: "SMY-SEMY-ARST-JV3_OCAB",
  //     },
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:Ty5wLZ92TqCHkIn80Mmipg",
  //       viewableName: "JV3-SEMY-P41-ASBUILT-COMMON AREAS",
  //     },
  //     {
  //       lineageUrn: "urn:adsk.wipemea:dm.lineage:U9tz-MHvQfS2Hg9gRITkdA",
  //       viewableName: "JV3-SEMY-P41-ASBUILT-OCAB",
  //     },
  //   ],
  // },
  {
    containerId: "ad45ddb0-25b9-451d-9c3a-61c7a6e0232f",
    modelSetId: "a202460b-8f04-4cea-b9cf-29b9f03a4ca7",
    modelSetViewId: "c3e76c0d-6441-4b2a-aace-93829f8eed66",
    definition: [
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:ys5aGM_9S8S7mQQVGsSk1Q",
        viewableName: "FV50-SEMY-P41-ASBUILT",
      },
      {
        lineageUrn: "urn:adsk.wipemea:dm.lineage:HT_kw5D_SEyxCe84jqaASQ",
        viewableName: "FV50-SEMY-ARST-ASBUILT",
      },
    ],
  },
  {
    containerId: "39d3702e-4095-44d4-8c29-becf571a90aa",
    modelSetId: "9f0d8737-f97b-4907-8bea-bead92e3d138",
    modelSetViewId: "8764d3c9-7695-4fb1-8397-f188f5898b31",
    "definition": [
                {
                    "lineageUrn": "urn:adsk.wipemea:dm.lineage:M5roTczIQUOnle1X26vdUg",
                    "viewableName": "Cover Sheet View"
                },
                {
                    "lineageUrn": "urn:adsk.wipemea:dm.lineage:RQ0A1TdvSf-KNJ-WZ2b3Tw",
                    "viewableName": "{3D}"
      }
    ]
  }
];

// async function getAccessToken(callback) {
//   try {
//     const resp = await fetch("/api/auth/token", {
//       method: "GET",
//       credentials: "include",
//     });
//     if (!resp.ok) {
//       throw new Error(await resp.text());
//     }
//     const { access_token, expires_in } = await resp.json();
//     callback(access_token, expires_in);
//     console.log("token");
//   } catch (err) {
//     alert("Could not obtain access token. See the console for more details.");
//     console.error(err.message);
//   }
// }

// function initViewer(container) {
//   return new Promise(function (resolve, reject) {
//     Autodesk.Viewing.Initializer(
//       {
//         getAccessToken,
//       },
//       async function () {
//         const config = {
//           extensions: [
//             "Autodesk.DocumentBrowser",
//             "Autodesk.AEC.Minimap3DExtension",
//           ],
//         };
//         const v = new Autodesk.Viewing.GuiViewer3D(container, config);
//         v.start();
//         v.setTheme("light-theme");
//         viewer = v;

//         resolve(v);
//       }
//     );
//   });
// }

// test
// let viewer = null;
let tokenCache = null;
let tokenExpiry = 0;

async function getAccessToken(callback) {
  const now = Date.now();
  // if (tokenCache && now < tokenExpiry) {
  //   return callback(tokenCache, (tokenExpiry - now) / 1000);
  // }
  console.log("getAccessToken called");
  console.log("tokenExpiry", tokenExpiry);
  if (now < tokenExpiry - 60_000) {
    return callback(tokenCache, (tokenExpiry - now) / 1000);
  }
  
  try {
    const authToken = localStorage.getItem("authTokenHemyIssue");
    const refreshToken = localStorage.getItem("refreshTokenHemyIssue");
    const expiresAt = localStorage.getItem("expires_atHemyIssue");
    const internalToken = localStorage.getItem("internal_tokenHemyIssue");

    // const resp = await fetch("/api/auth/token", {
    //   method: "GET",
    //   credentials: "include",
    //   headers: {
    //     "X-Refresh-Token": refreshToken || "",
    //     "X-Expires-At": expiresAt || "",
    //     "X-Internal-Token": internalToken || "",
    //   },
    // });
    // if (!resp.ok) throw new Error(await resp.text());

    // // Read body once
    // const data = await resp.json();
    // console.log("Token response data:", data);

    // // Extract values
    // const access_token = data.access_token;
    // const expires_in = data.expires_in;
    
    // tokenCache = access_token;
    // tokenExpiry = now + expires_in;

    console.log("token fetched, expires in", expiresAt, "seconds");
    // console.log("access_token:", authToken);
    callback(authToken, expiresAt);
    console.log("token fetched");
  } catch (err) {
    alert("Could not obtain access token. See console for more details.");
    console.error(err.message);
  }
}

export function initViewer(container) {
  return new Promise((resolve, reject) => {
    if (viewer) return resolve(viewer); // only initialize once

    Autodesk.Viewing.Initializer({ getAccessToken }, () => {
      const config = {
        extensions: [
          "Autodesk.DocumentBrowser",
          "Autodesk.AEC.Minimap3DExtension",
        ],
      };
      viewer = new Autodesk.Viewing.GuiViewer3D(container, config);
      viewer.start();
      viewer.setTheme("light-theme");
      
      viewer.setOptimizeNavigation(true)
      viewer.setQualityLevel(false, false);
      viewer.setGroundShadow(false);
      viewer.setGroundReflection(false);
      viewer.setProgressiveRendering(true);

      const runHideGenericModels = () => {
        viewerFunctions.hideGenericModels(viewer, viewer.impl.modelQueue().getModels());
      };

      viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, runHideGenericModels);

      [Autodesk.Viewing.ISOLATE_EVENT, Autodesk.Viewing.SHOW_ALL_EVENT].forEach(
        (evt) => viewer.addEventListener(evt, runHideGenericModels),
      );

      resolve(viewer);
    });
  });
}

function createCustomToolbar(viewer, onclick) {
  const toolbar = viewer.getToolbar();
}

export function loadModel(urn, guid) {
  function onDocumentLoadSuccess(doc) {
    var viewables = guid
      ? doc.getRoot().findByGuid(guid)
      : doc.getRoot().getDefaultGeometry();
    viewer.loadDocumentNode(doc, viewables);
    viewer.addEventListener(
      Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
      onGeometryLoaded
    );
  }
  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }
  Autodesk.Viewing.Document.load(
    "urn:" + urn,
    onDocumentLoadSuccess,
    onDocumentLoadFailure
  );
}

export function loadItemInModel(urn) {
  function onDocumentLoadSuccess(doc) {

    viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    viewer.addEventListener(
      Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
      () => { }
    );
  }

  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }

  const urn_encoded = window.btoa(urn).replace(/=/g, "");
  Autodesk.Viewing.Document.load(
    "urn:" + urn_encoded,
    onDocumentLoadSuccess,
    onDocumentLoadFailure
  );
}

function loadInitialModel(viewer, item, projectId) {
  function onDocumentLoadSuccess(doc) {
    selectedProjectItem = item;
    selectedProject = projectId;

    viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry());
    viewer.addEventListener(
      Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
      onInitialGeometryLoaded
    );
  }

  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }

  const urn = window.btoa(item.id).replace(/=/g, "");
  Autodesk.Viewing.Document.load(
    "urn:" + urn,
    onDocumentLoadSuccess,
    onDocumentLoadFailure
  );
}


function loadModelforIssueCreation(item) {
  function onDocumentLoadSuccess(doc) {
    selectedProjectItem = item;
    selectedProject = projectId;

    viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry(true));
    viewer.addEventListener(
      Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
      onGeometryIssueLoad
    );
  }
  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }
  const urn = window.btoa(item.id).replace(/=/g, "");
  Autodesk.Viewing.Document.load(
    "urn:" + urn,
    onDocumentLoadSuccess,
    onDocumentLoadFailure
  );
}

export async function setPushpinData(v) {
  pushpinData = v;
}

export async function createPushPins(v, issue) {
  var pushpinExtension = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );
  pushpinExtension.removeAllItems();
  pushpinExtension.showAll();

  const pushpin = [];

  if (issue.sheetGuid !== viewer.selectedItem.guid()) {
    var viewable = viewer.bubble.search({ guid: issue.sheetGuid }); // get sheet by guid
    if (!viewable.length) {
      return console.error("Sheet could not be found.");
    }
    // Select sheet to display (callbacks are the same as in `onDocumentLoadSuccess`)
    viewer.selectItem(viewable[0], onItemLoadSuccess, onItemLoadFail);
    // To highlight this pushpin in the sheet, use this function `PushPinExtensionHandle.selectOne(issue_id);` within the `onItemLoadSuccess` function.
  } else {
    // If the pushpin is in the current sheet, select the pushpin
    pushpinExtension.selectOne(issue.id);
    pushpin.push(v);

    pushpinExtension.loadItemsV2(pushpin);
    attachPushpinHoverTitles(pushpin, 0, pushpinExtension);
    pushpinExtension.selectOne(v.id);
  }
}

export async function pushpin_SelectOne(issueId, pushpin) {
  var pushpinExtension = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );
  // var pa = [];
  // pa.push(pushpin);

  //pushpinExtension.loadItemsV2(pa);
  pushpinExtension.selectOne(issueId);
}

function attachPushpinHoverTitles(pushpins = [], attempt = 0, extension = null) {
  if (!Array.isArray(pushpins) || pushpins.length === 0) return;

  ensureIssuePushpinTooltip();
  if (extension && !tooltipState.extensions.includes(extension)) {
    tooltipState.extensions.push(extension);
  }

  let appliedCount = 0;

  pushpins.forEach((pin) => {
    if (!pin?.id) return;

    // Create enhanced hover title with level information
    const hoverTitle = pin.level && window.availableLevels ? 
      `${pin.label || "Issue"} - Level: ${window.availableLevels.find(l => l.id === pin.level)?.name || 'Unknown'}` :
      pin.label || "Issue";
    
    // Populate map for our tooltip overlay. Even if the DOM node isn't
    // available yet, the map will be ready when it appears.
    tooltipState.titlesById[pin.id] = hoverTitle;

    const pushpinElement = document.getElementById(pin.id);
    if (!pushpinElement) return;

    // The Autodesk pushpin UI is made of nested DOM nodes; depending on where the
    // mouse lands, the hovered element might be a child (not the container).
    // Setting `title` on all descendants ensures the browser tooltip shows reliably.
    pushpinElement.setAttribute("title", hoverTitle);
    pushpinElement.setAttribute("aria-label", hoverTitle);
    const allDescendants = pushpinElement.querySelectorAll("*");
    allDescendants.forEach((el) => {
      el.setAttribute("title", hoverTitle);
      el.setAttribute("aria-label", hoverTitle);
    });
    appliedCount++;
  });

  // Pushpin nodes are rendered asynchronously; retry briefly until available.
  if (appliedCount < pushpins.length && attempt < 20) {
    setTimeout(() => attachPushpinHoverTitles(pushpins, attempt + 1, extension), 150);
  }

  // Also bind titles to pushpin container nodes managed by the extension.
  if (extension) {
    syncPushpinContainerTitles(extension);
  }
}

async function onGeometryLoaded(evt) {
  //load extension of pushpin
  //remove last items collection
  var pushpinExtension = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );
  pushpinExtension.removeAllItems();
  pushpinExtension.showAll();

  var pushpin = [];
  pushpin.push({
    type: "issues",
    id: pushpinData.id,
    label: pushpinData.title,
    status: pushpinData.status,
    position: pushpinData.position,
    objectId: pushpinData.objectId,
    viewerState: pushpinData.viewerState,
  });
  pushpinExtension.loadItemsV2(pushpin);
  attachPushpinHoverTitles(pushpin, 0, pushpinExtension);
  pushpinExtension.selectOne(pushpinData.id);
}
async function onInitialGeometryLoaded(evt) {
  //load extension of pushpin
  //remove last items collection

  console.log("Viewer With Model", viewer);
  pushpinExt = await viewer.loadExtension("Autodesk.BIM360.Extension.PushPin");

  pushpinExt.pushPinManager.addEventListener("pushpin.created", function (e) {
    pushpinExt.endCreateItem();
    console.log({ e });
    const newIssue = e.value.itemData;
    pushpinExt.setDraggableById(newIssue.id, true);
    // console.log(e);
  });

  const fasIcon = document.createElement("i");

  pushpinExt.pushPinManager.addEventListener("pushpin.selected", function (e) {
    console.log(e);
    const pushPinItem = e.value;
    const pushPinList = e.target.pushPinList;
    fasIcon.className = "";
    fasIcon.style.fontSize = "";

    pushPinList.forEach((pushpin) => {
      const unselectedPusPinsDiv = document.getElementById(pushpin.itemData.id);
      unselectedPusPinsDiv.backgroundImage = "";
    });
    // const pushpindiv = document.getElementById(pushPinItem.itemData.id);
    // pushpindiv.style.backgroundImage = "";
  });

  pushpinExt.removeAllItems();
  pushpinExt.showAll();

  // #region: initial load issues
  const filter = {
    "filter[linkedDocumentUrn]": selectedProjectItem.relationships.item.data.id,
  };

  console.log("Selected: ", selectedProject);
  let allIssues = await getAllIssues(selectedProject, filter);
  allIssues = Array.isArray(allIssues) ? allIssues.filter((issue) => issue.status === "open") : [];

  //console.log({ allIssues });

  var pushpin = [];

  //  await populateIssueList('#issue-list', allIssues)
  $.each(allIssues, (index, issue) => {
    // const customAttributes = issue.customAttributes;
    // console.log("Issue for pushpin", issue);
    //  console.log(issue);
    const pushpinDetails =
      issue.linkedDocuments.length > 0
        ? issue.linkedDocuments[0].details
        : null;

    if (pushpinDetails) {
      pushpin.push({
        type: "issues",
        id: issue.id,
        label: issue.title,
        status: issue.status,
        position: pushpinDetails.position,
        objectId: pushpinDetails.objectId,
        viewerState: pushpinDetails.viewerState,
        level: getLevelForPosition(pushpinDetails.position),
      });
    }
  });
  pushpinExt.loadItemsV2(pushpin);
  attachPushpinHoverTitles(pushpin, 0, pushpinExt);

  const showClosedCheckbox = document.getElementById('show-closed-issues');
  if (showClosedCheckbox) {
    showClosedCheckbox.checked = false;
  }

  if (typeof performFilteringWithGetAllIssues === 'function') {
    await performFilteringWithGetAllIssues('');
  }
  // const urn = window.btoa(item.id).replace(/=/g, "");
  // Autodesk.Viewing.Document.load(
  //   "urn:" + urn,
  //   onDocumentLoadSuccess,
  //   onDocumentLoadFailure
  // );
}

export async function loadModelAndIssues(viewer, item, projectId) {
  selectedProjectItem = item;
  selectedProject = projectId;
  loadedModelCounter = 0;
  await getProjectModels(projectId);
  await loadIssuesList(projectId);

  const showClosedCheckbox = document.getElementById('show-closed-issues');
  if (showClosedCheckbox) {
    showClosedCheckbox.checked = false;
  }

  if (typeof performFilteringWithGetAllIssues === 'function') {
    await performFilteringWithGetAllIssues('');
  }
  // const urn = window.btoa(item.id).replace(/=/g, "");
  // Autodesk.Viewing.Document.load(
  //   "urn:" + urn,
  //   onDocumentLoadSuccess,
  //   onDocumentLoadFailure
  // );
}

// ! load models
// #region load models
async function getProjectModels(containerId) {

  function onDocumentLoadSuccess(doc) {
    const geometry = doc.getRoot().getDefaultGeometry();
    // geometry?.globalOffset || 
    const offset = geometry?.globalOffset || { x: 0, y: 0, z: 0 };

    console.log("Model Global Offset:", offset);
    
    const loadOptions = {
      applyrefPoint: true, // only for first model
      globalOffset: offset,
      keepCurrentModels: true,
    };
    // placementTransform: new THREE.Matrix4().setPosition(offset),

    viewer.loadDocumentNode(doc, geometry, loadOptions);

    // viewer.addEventListener(
    //   Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
    //   modelLoaded
    // );

    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, (event) => {
      modelLoaded(event);
    });

  }
  
  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }

  const projectItems = await getOneProject(containerId);
  console.log("PRoject Items", projectItems);
  modelCount = projectItems.length;
  const modelSet = modelSetViews.filter(
    (model) => model.containerId === containerId
  );


  
  if (modelSet.length > 0) {
    modelCount = modelSet[0].definition.length;
    const projectItemResults = await Promise.all(projectItems);
    console.log("Project Item Results:", projectItemResults);

    modelSet[0].definition.forEach(async (model, index) => {
      let objItem = projectItemResults.filter(
        (item) => item.id === model.lineageUrn
      );

      console.log("Object:", objItem);
      console.log("Model Lineage URN:", modelSet[0]);
      console.log("Loaded Model Counter:", modelsLoaded);
      console.log("Model container:", modelSet[0].containerId);
      console.log("Model urn:", modelSet[0].definition[modelsLoaded].lineageUrn);

      // #region new loading fix
      // !! Fix if the item is not found. Get the latest version URN from versions 
      // * SAMPLE HG62
      let base64Urn = null;

      if(!objItem.length) {
        console.warn("No matching item found for lineageUrn:", model.lineageUrn);
        const accessToken = localStorage.getItem('authTokenHemyIssue'); // Retrieve the access token
        const versionsUrl = `https://developer.api.autodesk.com/data/v1/projects/b.${modelSet[0].containerId}/items/${model.lineageUrn}/versions`;
        const response = await fetch(versionsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const versionsData = await response.json();
        console.log('Latest Version URN:', versionsData);
        if (versionsData.data && versionsData.data.length > 0) {
            const latestVersion = versionsData.data[0];  // Assuming the first item is the latest
            console.log('Latest Version Data:', latestVersion);
            g_projectItems.push(latestVersion);
            let latestVersionUrn = latestVersion.id;  // This will be the URN for the latest version
            console.log('Latest Version URN:', latestVersionUrn);
            base64Urn = btoa(latestVersionUrn);  // This encodes the URN to base64
            // console.log('Base64 URN:', base64Urn);
        } else {
            console.error('No versions found for the file.');
        }
      }

      if (objItem.length && objItem[0].latestVersion) {
        g_projectItems.push(objItem[0]);
        const urn = window.btoa(objItem[0].latestVersion.id).replace(/=/g, "");
        console.log("Item URN", urn);
        Autodesk.Viewing.Document.load(
          `urn:${urn}`,
          onDocumentLoadSuccess,
          onDocumentLoadFailure
        );
      } else if (base64Urn) {
        console.log("Using fallback URN", base64Urn);
        Autodesk.Viewing.Document.load(`urn:${base64Urn}`, onDocumentLoadSuccess, onDocumentLoadFailure);
      } else {
        alert("There's a problem on the model.Please contact admin.");
      }
      modelsLoaded++;
    });
    // #endregion
  } else {
    projectItems.forEach(async (item, index) => {
      const itemObj = await item;
      const latestVersion = itemObj.latestVersion;
      // issueFilter = {
      //   "filter[linkedDocumentUrn]": itemObj.id,
      // };
      // allIssues = await getAllIssues(projectId, issueFilter);
      //      console.log("ItemObj", itemObj);
      g_projectItems.push(itemObj);
      const urn = window.btoa(latestVersion.id).replace(/=/g, "");
      console.log("Item URN", urn);
      Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
      );
    });
  }
}


// !!!! test fix 2
// async function getProjectModels(containerId) {
//   let offset = null;
  

//   function onDocumentLoadFailure(code, message) {
//     alert("Could not load model. See console for more details.");
//     console.error(message);
//   }

//   function onDocumentLoadSuccess(doc) {
//     return new Promise((resolve, reject) => {
//       const geometry = doc.getRoot().getDefaultGeometry();
//       const loadOptions = {
//         keepCurrentModels: true, // Keeps existing models in the viewer
//       };
//       // const loadOptions = {
//       //   keepCurrentModels: true,
//       //   applyRefPoint: modelsLoaded === 0, // only for first model
//       //   globalOffset: modelsLoaded === 0 ? undefined : offset,
//       //   skipHiddenFragments: true,
//       // };


//       // ✅ Keep this listener
//       viewer.addEventListener(
//         Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
//         modelLoaded
//       );

//       const modelOrPromise = viewer.loadDocumentNode(doc, geometry, loadOptions);

//       // await modelLoaded();

//       Promise.resolve(modelOrPromise)
//         .then((model) => {
//           modelsLoaded++;
//           if (modelsLoaded === 1) {
//             offset = model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };
//             console.log("model.getData()", model.getData());
//             console.log("✅ Saved offset from first model:", offset);
//           }

//           console.log(`✅ Model #${modelsLoaded} fully loaded`);
//           resolve();
//         })
//         .catch((err) => {
//           console.error("Error loading model:", err);
//           reject(err);
//         });
//     });
//   }

//   const projectItems = await getOneProject(containerId);
//   console.log("Project Items", projectItems);
//   let modelList = [];
//   modelCount = projectItems.length;

//   const modelSet = modelSetViews.filter(
//     (model) => model.containerId === containerId
//   );

//   if (modelSet.length > 0) {
//     const projectItemResults = await Promise.all(projectItems);
//     modelList = modelSet[0].definition.map((model) => {
//       const objItem = projectItemResults.find(
//         (item) => item.id === model.lineageUrn
//       );
//       return objItem?.latestVersion ? objItem : null;
//     }).filter(Boolean);
//   } else {
//     modelList = await Promise.all(projectItems);
//   }

//   // 🚀 Load models one by one
//   for (const itemObj of modelList) {
//     g_projectItems.push(itemObj);
//     const latestVersion = itemObj.latestVersion;
//     const urn = window.btoa(latestVersion.id).replace(/=/g, "");
//     console.log("Item URN", urn);

//     await new Promise((resolve, reject) => {
//       Autodesk.Viewing.Document.load(
//         `urn:${urn}`,
//         async (doc) => {
//           try {
//             await onDocumentLoadSuccess(doc);
//             resolve();
//           } catch (err) {
//             reject(err);
//           }
//         },
//         (code, message) => {
//           onDocumentLoadFailure(code, message);
//           reject(message);
//         }
//       );
//     });
//   }

//   console.log("✅ All models loaded:", modelsLoaded);




async function modelLoaded(evt) {
  console.log("Model loaded event received");
  loadedModelCounter++;
  if (loadedModelCounter === modelCount) {
    if (viewer.model) {
      // await viewer.loadExtension("Autodesk.AEC.LevelsExtension").then(async (levelsExt) => {
      //   console.log("Levels Extension Loaded");

      //    // Wait a bit for geometry + internal state to stabilize
      //   await new Promise((res) => setTimeout(res, 1000));

      //   await loadIssuePushpins();
      // });

      await viewer.loadExtension("Autodesk.AEC.LevelsExtension").then(async (levelsExt) => {
        console.log("Levels Extension Loaded");

        // Wait until geometry and object tree are ready
        if (viewer.model?.getData()?.instanceTree) {
          console.log("✅ Object tree already available — loading pushpins now");
        } else {
          console.log("⏳ Waiting for object tree to be created...");
          await new Promise((resolve) => {
            const onTreeReady = () => {
              console.log("✅ Object tree ready, loading pushpins now");
              viewer.removeEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, onTreeReady);
              resolve();
            };
            viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, onTreeReady);
          });
        }

        // ✅ Force the viewer to start rendering before loading pushpins
        await new Promise((resolve) => requestAnimationFrame(resolve));

        await loadIssuePushpins();

        // ✅ Force a redraw — PushPin sometimes misses initial invalidate()
        viewer.impl.invalidate(true, true, true);
        console.log("🔁 Viewer invalidated after pushpin load");
      });
      
console.log("Removing unwanted toolbar buttons...");
      const removeToolbarButtons = () => {
    const navTools = viewer.toolbar.getControl("navTools");
    const modelTools = viewer.toolbar.getControl("modelTools");

    if (navTools) {
      const cameraBtn = navTools.getControl("toolbar-cameraSubmenuTool");
      if (cameraBtn) navTools.removeControl(cameraBtn); // Remove Camera Interaction
    }

    if (modelTools) {
      const documentBtn = modelTools.getControl("toolbar-documentModels");
      if (documentBtn) modelTools.removeControl(documentBtn); // Remove Document Browser

      const explodeBtn = modelTools.getControl("toolbar-explodeTool");
      if (explodeBtn) modelTools.removeControl(explodeBtn); // Remove Explode Model

      const fieldIssuesBtn = modelTools.getControl("toolbar-pushpinFieldIssuesVis");
      if (fieldIssuesBtn) modelTools.removeControl(fieldIssuesBtn); // Remove Field Issues

      const rfiBtn = modelTools.getControl("toolbar-pushpinRfisVis");
      if (rfiBtn) modelTools.removeControl(rfiBtn); // Remove RFI
    }
  };

  // Run after a short delay to ensure toolbar and extensions are fully loaded
  setTimeout(removeToolbarButtons, 500);
  setTimeout(removeToolbarButtons, 1000);
  setTimeout(removeToolbarButtons, 1500);

        

      // await recenterModelsDynamically(viewer);

      //  viewer.loadExtension("Autodesk.AEC.LevelsExtension").then(function (levelsExt) {
      //     if (levelsExt && levelsExt.floorSelector) {
      //       const floorData = levelsExt.floorSelector;

      //       setTimeout(() => {
      //         const levels = floorData._floors;
      //         console.log("Floor Array after delay:", levels);

      //         if (levels && levels.length > 0) {
      //           levels.forEach((floor, index) => {
      //             // console.log(`Floor ${index}:`, floor);
      //           });
      //         } else {
      //           console.error("Floors array is still empty.");
      //         }
              
      //       }, 1000); // Wait for 1 second before checking
      //     } else {
      //       console.error("Levels Extension or floorSelector is not available.");
      //     }
      //   });

      

      viewer.loadExtension("Autodesk.AEC.Minimap3DExtension").then(async () => {
        console.log("Minimap3DExtension Extension Loaded");
      });

        if (hardAsset || functionalLocation) {

          const checkModelsLoaded = async () => {
            while (!viewer.impl.modelQueue().getModels().length) {
              console.log("⏳ Waiting for models to load...");
              await new Promise(r => setTimeout(r, 500));
            }
          };

          await checkModelsLoaded(); // wait until all models are actually loaded

          const ha = hardAsset?.trim?.() || null;
          const fl = functionalLocation?.trim?.() || null;

          if (ha || fl) {
            await navigateHAFL(viewer, ha, fl);
          } else {
            console.log("No valid Hard Asset or Functional Location provided.");
          }
        }

      if (deviceType) {
        if (deviceType == "mobile") {
          await hideToolbar(viewer, [
            {
              type: "navTools",
              toolbarIds: [
                "toolbar-orbitTools",
                "toolbar-panTool",
                "toolbar-zoomTool",
                "toolbar-cameraSubmenuTool",
                "toolbar-bimWalkTool"
              ]
            },
            {
              type: "modelTools",
              toolbarIds: [
                "toolbar-measurementSubmenuTool",
                "toolbar-sectionTool",
                "toolbar-documentModels",
                "toolbar-explodeTool",
                "toolbar-pushpinVis",
                "toolbar-pushpinFieldIssuesVis",
                "toolbar-pushpinRfisVis"
              ]
            },
            {
              type: "settingsTools",
              toolbarIds: [
                "toolbar-fullscreenTool",
                "toolbar-propertiesTool",
                "toolbar-settingsTool"
              ]
            }
          ]);
        }
      }
    }
  }
}

// #endregion






































// Export for viewer pages
export async function loadModelsandCreateIssue(viewer, projectId, srcParam) {
  selectedProject = projectId;
  src = srcParam;
  loadedModelCounter = 0;
  viewer.addEventListener(
    Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
    issuesModelLoaded
  );

  function onDocumentLoadSuccess(doc) {
    const loadOptions = {
      // globalOffset: { x: 0, y: 0, z: 0 }, // force all models to origin
      // placementTransform: new THREE.Matrix4().setPosition({ x: 0, y: 0, z: 0 }), // Force placement to origin
      keepCurrentModels: true, // Keeps existing models in the viewer
    };
    viewer.loadDocumentNode(
      doc,
      doc.getRoot().getDefaultGeometry(),
      loadOptions
    );
  }

  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);
  }

  const projectItems = await getOneProject(projectId);
  //allIssues = await getAllIssues(projectId, {});
  modelCount = projectItems.length;
  const modelSet = modelSetViews.filter(
    (model) => model.containerId === projectId
  );

  if (modelSet.length > 0) {
    // console.log("Model Set Found:", modelSet);
    modelCount = modelSet[0].definition.length;
    const projectItemResults = await Promise.all(projectItems);
    modelSet[0].definition.forEach(async (model, index) => {
      const objItem = projectItemResults.filter(
        (item) => item.id === model.lineageUrn
      );
      //console.log(objItem);
      if (objItem[0].latestVersion) {
        g_projectItems.push(objItem[0]);
        const urn = window.btoa(objItem[0].latestVersion.id).replace(/=/g, "");
        console.log("Item URN", urn);
        Autodesk.Viewing.Document.load(
          `urn:${urn}`,
          onDocumentLoadSuccess,
          onDocumentLoadFailure
        );
      }
    });
  }
  else {
    projectItems.forEach(async (item, index) => {
      const itemObj = await item;
      const latestVersion = itemObj.latestVersion;
      console.log("ItemObj", "Item ", index + 1);
      const urn = window.btoa(latestVersion.id).replace(/=/g, "");
      g_projectItems.push(itemObj);
      console.log("Item URN", urn);
      Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
      );
    });
  }

}


async function loadModelsandLoadOneIssue(
  viewer,
  projectId,
  issueDetails,
  srcParam
) {
  selectedProject = projectId;
  src = srcParam;
  loadedModelCounter = 0;
  oneIssueDetails = issueDetails;

  viewer.addEventListener(
    Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
    async (evt) => {
      loadedModelCounter++;
      console.log("Loaded Geometry", loadedModelCounter);
      // console.log("Model Count", modelCount);
      if (loadedModelCounter === modelCount) {
        await viewer
          .loadExtension("Autodesk.AEC.LevelsExtension")
          .then(async () => {
            console.log("Levels Extension Loaded");
            await viewer
              .loadExtension("Autodesk.BIM360.Extension.PushPin")
              .then(async (ext) => {
                ext.removeAllItems();
                ext.showAll();

                var pushpin = [];
                pushpin.push({
                  type: "issues",
                  id: oneIssueDetails.id,
                  label: `#${oneIssueDetails.displayId} - ${oneIssueDetails.title}`,
                  status: oneIssueDetails.status,
                  position: oneIssueDetails.linkedDocuments[0].details.position,
                  objectId: oneIssueDetails.linkedDocuments[0].details.objectId,
                  viewerState:
                    oneIssueDetails.linkedDocuments[0].details.viewerState,
                });

                await ext.loadItemsV2(pushpin);
                attachPushpinHoverTitles(pushpin, 0, ext);

                console.log("Pushpin Manager", ext);

                ext.pushPinManager.addEventListener(
                  "pushpin.selected",
                  async (e) => {
                    console.log("pushpin.selected", e);
                    const leaflet = document.querySelector(
                      ".leaflet-text-label"
                    );
                    if (leaflet) {
                      leaflet.addEventListener("click", (e) => {
                        console.log(e);
                      });
                    }
                  }
                );

                // Attach double-click event to each pushpin

                const pushpinContainer = document.querySelector(
                  ".adsk-viewing-viewer"
                ); // Adjust if needed
                if (pushpinContainer) {
                  pushpinContainer.addEventListener("dblclick", (event) => {
                    const pushpins = ext.pushPinManager.pushPinList;
                    console.log(event);

                    pushpins.forEach((pushpin) => {
                      if (pushpin.container.contains(event.target)) {
                        event.stopPropagation();
                        console.log("dblclick", e);
                      }
                    });
                  });

                  console.log(
                    "Double-click event attached via pushpin container."
                  );
                }

                await viewer.addEventListener(
                  ext.PUSH_PINS_LOADED_EVENT,
                  () => {
                    console.log("Pushpins loaded, adding dblclick listener...");

                    const pushPinManager = ext.pushPinManager;

                    viewer.container.addEventListener("dblclick", (event) => {
                      const pushpins = pushPinManager.pushPinList;
                      console.log(event);
                      pushpins.forEach((pushpin) => {
                        // Check if the double-clicked target is inside a pushpin
                        if (pushpin.container.contains(event.target)) {
                          event.stopPropagation(); // Prevent conflicts
                          console.log("dblclick", e);
                        }
                      });
                    });

                    console.log(
                      "Double-click event attached via Viewer container."
                    );
                  }
                );
              });

            //    pushpinExt.selectOne(oneIssueDetails.id);
          });
      }

    }
  );

  function onDocumentLoadSuccess(doc) {
    const loadOptions = {
      globalOffset: { x: 0, y: 0, z: 0 }, // force all models to origin
      placementTransform: new THREE.Matrix4().setPosition({ x: 0, y: 0, z: 0 }), // Force placement to origin
      keepCurrentModels: true, // Keeps existing models in the viewer
    };
    viewer.loadDocumentNode(
      doc,
      doc.getRoot().getDefaultGeometry(),
      loadOptions
    );
  }

  function onDocumentLoadFailure(code, message) {
    alert("Could not load model. See console for more details.");
    console.error(message);

  }

  const projectItems = await getOneProject(projectId);
  //allIssues = await getAllIssues(projectId, {});

  modelCount = projectItems.length;
  const modelSet = modelSetViews.filter(
    (model) => model.containerId === projectId
  );
  let base64Urn = null;

 if (modelSet.length > 0) {
    modelCount = modelSet[0].definition.length;
    const projectItemResults = await Promise.all(projectItems);
    console.log("Project Item Results", projectItemResults);
    console.log("Model Set", modelSet[0].definition);
    modelSet[0].definition.forEach(async (model, index) => {
      const objItem = projectItemResults.filter(
        (item) => item.id === model.lineageUrn
      );
      console.log("Object", objItem);
      if(!objItem.length) {
        console.warn("No matching item found for lineageUrn:", model.lineageUrn);
        const accessToken = localStorage.getItem('authTokenHemyIssue'); // Retrieve the access token
        const versionsUrl = `https://developer.api.autodesk.com/data/v1/projects/b.${modelSet[0].containerId}/items/${model.lineageUrn}/versions`;
        const response = await fetch(versionsUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
      
        const versionsData = await response.json();
        console.log('Latest Version URN:', versionsData);
        if (versionsData.data && versionsData.data.length > 0) {
            const latestVersion = versionsData.data[0];  // Assuming the first item is the latest
            console.log('Latest Version Data:', latestVersion);
            g_projectItems.push(latestVersion);
            let latestVersionUrn = latestVersion.id;  // This will be the URN for the latest version
            console.log('Latest Version URN:', latestVersionUrn);
            base64Urn = btoa(latestVersionUrn);  // This encodes the URN to base64
            // console.log('Base64 URN:', base64Urn);
        } else {
            console.error('No versions found for the file.');
        }
      }
      // if (objItem == null || !objItem.length) return;
      // const urn = window.btoa(objItem[0].latestVersion.id).replace(/=/g, "");
      // Autodesk.Viewing.Document.load(
      //   `urn:${urn}`,
      //   onDocumentLoadSuccess,
      //   onDocumentLoadFailure
      // );
      if (objItem.length && objItem[0].latestVersion) {
        g_projectItems.push(objItem[0]);
        const urn = window.btoa(objItem[0].latestVersion.id).replace(/=/g, "");
        console.log("Item URN", urn);
        Autodesk.Viewing.Document.load(
          `urn:${urn}`,
          onDocumentLoadSuccess,
          onDocumentLoadFailure
        );
      } else if (base64Urn) {
        console.log("Using fallback URN", base64Urn);
        Autodesk.Viewing.Document.load(`urn:${base64Urn}`, onDocumentLoadSuccess, onDocumentLoadFailure);
      } else {
        alert("There's a problem on the model.Please contact admin.");
      }
    });
  }
  else {
    projectItems.forEach(async (item, index) => {
      const itemObj = await item;
      const latestVersion = itemObj.latestVersion;
      // issueFilter = {
      //   "filter[linkedDocumentUrn]": itemObj.id,
      // };
      // allIssues = await getAllIssues(projectId, issueFilter);
      console.log("ItemObj", itemObj);
      const urn = window.btoa(latestVersion.id).replace(/=/g, "");
      console.log("Item URN", urn);
      Autodesk.Viewing.Document.load(
        `urn:${urn}`,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
      );
    });
  }



}

async function issuesModelLoaded(evt) {
  //load extension of pushpin
  //remove last items collection
  loadedModelCounter++;
  console.log("Loaded Geomteries", loadedModelCounter);
  if (loadedModelCounter === modelCount) {
    // Initialize workset panel when models are loaded
    console.log("Initializing workset panel...");
    try {
      viewerFunctions.workset(viewer);
      console.log("Workset panel initialized successfully");
    } catch (error) {
      console.error("Error initializing workset panel:", error);
    }
    
    await viewer.loadExtension("Autodesk.AEC.LevelsExtension").then(async () => {
      console.log("Levels Extension Loaded");

    });
    if (deviceType) {
      if (deviceType == "mobile") {
        await hideToolbar(viewer, [
          {
            type: "navTools",
            toolbarIds: [
              "toolbar-orbitTools",
              "toolbar-panTool",
              "toolbar-zoomTool",
              "toolbar-cameraSubmenuTool",
              "toolbar-bimWalkTool"
            ]
          },
          {
            type: "modelTools",
            toolbarIds: [
              "toolbar-measurementSubmenuTool",
              "toolbar-sectionTool",
              "toolbar-documentModels",
              "toolbar-explodeTool",
              "toolbar-pushpinVis",
              "toolbar-pushpinFieldIssuesVis",
              "toolbar-pushpinRfisVis"
            ]
          },
          {
            type: "settingsTools",
            toolbarIds: [
              "toolbar-fullscreenTool",
              "toolbar-propertiesTool",
              "toolbar-settingsTool"
            ]
          }

        ]);

        await initiateCreateIssue_Mobile(viewer, { new_guid: newGuid }, userGuid);
      }

    }

    else {
      await initIssueCreate();
    }


  }
}

// #region: Load Pushpins
async function loadIssuePushpins(filter = {}) {
  console.log("Loading issue pushpins and initializing workset system...");
  try {
    viewerFunctions.workset(viewer);
    console.log("Workset function called successfully");
  } catch (error) {
    console.error("Error calling workset function:", error);
  }
  
  pushpinExt = await viewer.loadExtension("Autodesk.BIM360.Extension.PushPin");

  // Ensure issue titles are applied to newly created pushpins.
  if (!pushpinExt.__issueHoverTitlesCreatedBound) {
    pushpinExt.__issueHoverTitlesCreatedBound = true;
    pushpinExt.pushPinManager.addEventListener("pushpin.created", (e) => {
      const itemData = e?.value?.itemData;
      if (!itemData?.id) return;
      const label = itemData.label || "Issue";
      attachPushpinHoverTitles([{ id: itemData.id, label }], 0, pushpinExt);
    });
  }

  pushpinExt.pushPinManager.addEventListener(
    "pushpin.selected",
    async function (e) {
      //  console.log(e);
      const pushPinItem = e.value;
      const pushPinList = e.target.pushPinList;
      pushPinList.forEach((pushpin) => {
        const unselectedPusPinsDiv = document.getElementById(
          pushpin.itemData.id
        );
        if (!unselectedPusPinsDiv.classList.contains("selected")) {
          unselectedPusPinsDiv.classList.add("unselected");
        } else {
          unselectedPusPinsDiv.classList.remove("unselected");
        }
      });
    }
  );
  pushpinExt.removeAllItems();
  pushpinExt.showAll();
  // const filter = {
  //   "filter[linkedDocumentUrn]": selectedProjectItem.relationships.item.data.id,
  // };

  let pushpin = [];
  console.log("Selected Project for Pushpins", selectedProject);
  let allIssues = await getAllIssues(selectedProject);
  allIssues = Array.isArray(allIssues) ? allIssues.filter((issue) => issue.status === "open") : [];
  console.log('All Issues', allIssues)
  $.each(allIssues, (index, issue) => {
    //  console.log(issue);
    const pushpinDetails =
      issue.linkedDocuments.length > 0
        ? issue.linkedDocuments[0].details
        : null;

    if (pushpinDetails && pushpinDetails.position) {
      pushpin.push({
        type: "issues",
        id: issue.id,
        label: `#${issue.displayId} - ${issue.title}`,
        status: issue.status,
        position: pushpinDetails.position,
        objectId: pushpinDetails.objectId,
        viewerState: pushpinDetails.viewerState,
      });
    }
  });
  pushpinExt.loadItemsV2(pushpin);
  attachPushpinHoverTitles(pushpin, 0, pushpinExt);
  console.log("Pushpin Manager", pushpin);
  loadIssuesListFiltered(selectedProject, pushpin);
}
// #endregion


// ! pushpin filtered
// #region: pushpin filtered
// Export for viewer pages
export async function loadIssuePushpinsFiltered(issueStatus, issueSubtype) {
  console.log('Filter Issues Called');
  pushpinExt = await viewer.loadExtension("Autodesk.BIM360.Extension.PushPin");

  // Ensure issue titles are applied to newly created pushpins.
  if (!pushpinExt.__issueHoverTitlesCreatedBound) {
    pushpinExt.__issueHoverTitlesCreatedBound = true;
    pushpinExt.pushPinManager.addEventListener("pushpin.created", (e) => {
      const itemData = e?.value?.itemData;
      if (!itemData?.id) return;
      const label = itemData.label || "Issue";
      attachPushpinHoverTitles([{ id: itemData.id, label }], 0, pushpinExt);
    });
  }

  pushpinExt.pushPinManager.addEventListener(
    "pushpin.selected",
    async function (e) {
      //  console.log(e);
      const pushPinItem = e.value;
      const pushPinList = e.target.pushPinList;
      pushPinList.forEach((pushpin) => {
        const unselectedPusPinsDiv = document.getElementById(
          pushpin.itemData.id
        );
        if (!unselectedPusPinsDiv.classList.contains("selected")) {
          unselectedPusPinsDiv.classList.add("unselected");
        } else {
          unselectedPusPinsDiv.classList.remove("unselected");
        }
      });
    }
  );
  pushpinExt.removeAllItems();
  pushpinExt.showAll();
  // const filter = {
  //   "filter[linkedDocumentUrn]": selectedProjectItem.relationships.item.data.id,
  // };

  let pushpin = [];
  console.log("Selected Project for Pushpins", selectedProject);
  const filter = {};
  if (issueStatus) filter.status = issueStatus;
  if (issueSubtype) filter.issueSubtypeId = issueSubtype;
  
  const allIssues = await getIssuesFiltered(selectedProject, filter);
  const openOnlyIssues = Array.isArray(allIssues) ? allIssues.filter((issue) => issue.status === "open") : [];
  console.log('All Issues', openOnlyIssues)
  $.each(openOnlyIssues, (index, issue) => {
    //  console.log(issue);
    const pushpinDetails =
      issue.linkedDocuments.length > 0
        ? issue.linkedDocuments[0].details
        : null;

    if (pushpinDetails && pushpinDetails.position) {
      pushpin.push({
        type: "issues",
        id: issue.id,
        label: `#${issue.displayId} - ${issue.title}`,
        status: issue.status,
        position: pushpinDetails.position,
        objectId: pushpinDetails.objectId,
        viewerState: pushpinDetails.viewerState,
      });
    }
  });
  pushpinExt.loadItemsV2(pushpin);
  attachPushpinHoverTitles(pushpin, 0, pushpinExt);
  console.log("Pushpin Manager", pushpin);
  loadIssuesListFiltered(selectedProject, pushpin);
}
// #endregion

// #region: Load Issues List Filtered
async function loadIssuesListFiltered(containerId, pushpin) {
  const divIssueSidebar = document.getElementById("issues-sidebar-items");
  divIssueSidebar.innerHTML = "";
  //console.log(allIssues);

  const issues = pushpin;
  // console.log("Issues", issues);
  $.each(issues, (index, issue) => {
    if (issue.status !== "open") {
      return;
    }
    const divSubIcon = document.createElement("div");
    const customAttributes = Array.isArray(issue.customAttributes) ? issue.customAttributes : [];
    const findHemyXLink = customAttributes.filter(
      (attributes) => attributes.title === "Hemy X Link"
    );
    const hemyLinkAttribute = findHemyXLink[0];
    //   console.log(hemyLinkAttribute);
    let innerSubIcon = "";

    divSubIcon.setAttribute("id", `div-issue-subicon-${issue.id}`);

    const statusDisplay = {
      open: {
        title: "Open",
        color: "#f5bf42",
      },
      draft: {
        title: "Draft",
        color: "#000000",
      },
      pending: {
        title: "Pending",
        color: "blue",
      },
      in_review: {
        title: "In Review",
        color: "purple",
      },
      closed: {
        title: "Closed",
        color: "gray",
      },
    };
    // console.log("TEST:",hemyLinkAttribute);
    // console.log("TEST:",hemyLinkAttribute.value);
    if (hemyLinkAttribute && hemyLinkAttribute.value) {
      innerSubIcon = ` <div class="d-block justify-content-between">
                            <div class="d-flex">
                               <h6 class="mb-1 fw-bold">${issue.label}</h6>
                            </div>
                            <div class="d-flex" style="height: 20px; align-items: center;">
                                <div style="border-radius: 5px; width: 5px; height: 20px; background-color: ${statusDisplay[issue.status].color
        }"></div>
                                <small class="ms-1">${statusDisplay[issue.status].title
        } &middot;</small>
                                <a id="deviation-${issue.id
        }" target="_blank" href="${hemyLinkAttribute.value
        }" title="Go to record"
                                    style="color: #495057;" class="ms-2">
                                    <svg class="w-[18px] h-[18px] text-gray-800 dark:text-white" aria-hidden="true"
                                        xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none"
                                        viewBox="0 0 24 24">
                                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M3 15v3c0 .5523.44772 1 1 1h9.5M3 15v-4m0 4h9m-9-4V6c0-.55228.44772-1 1-1h16c.5523 0 1 .44772 1 1v5H3Zm5 0v8m4-8v8m7.0999-1.0999L21 16m0 0-1.9001-1.9001M21 16h-5" />
                                    </svg>
                                </a>
                            </div>
                        </div>`;
    } else {
      innerSubIcon = ` <div class="d-block justify-content-between">
                            <div class="d-flex">
                               <h6 class="mb-1 fw-bold">${issue.label}</h6>
                            </div>
                            <div class="d-flex" style="height: 20px; align-items: center;">
                                <div style="border-radius: 5px; width: 5px; height: 20px; background-color: ${statusDisplay[issue.status].color
        }"></div>
                                <small class="ms-1">${statusDisplay[issue.status].title
        } &middot;</small>
                            </div>
                        </div>`;
    }
    divSubIcon.innerHTML = innerSubIcon;
    divSubIcon.className = "sub-icon issue";

    divSubIcon.onclick = (event) => {
      pushpinExt.selectOne(issue.id);
      $.each(issues, (index, issue_subicon) => {
        const subicon = document.getElementById(
          `div-issue-subicon-${issue_subicon.id}`
        );
        if (
          divSubIcon.getAttribute("id") ===
          `div-issue-subicon-${issue_subicon.id}`
        ) {
          subicon.classList.add("active");
        } else {
          subicon.classList.remove("active");
        }
      });
      //console.log(divSubIcon.getAttribute("id"));
    };

    divIssueSidebar.appendChild(divSubIcon);
  });
}
// #endregion




// * Load Issues List
// #region: Load Issues List
async function loadIssuesList(containerId) {
  const divIssueSidebar = document.getElementById("issues-sidebar-items");
  divIssueSidebar.innerHTML = "";
  //console.log(allIssues);

  let issues = [];
  try {
    if (window.getAllIssues) {
      issues = await window.getAllIssues(containerId);
    } else {
      console.error("getAllIssues not available");
    }
  } catch (error) {
    console.error("Error getting issues:", error);
  }
  issues = Array.isArray(issues) ? issues.filter((issue) => issue.status === "open") : [];
  // console.log("Issues", issues);
  $.each(issues, (index, issue) => {
    // ! BS19
    // #region: bandaid solution bs19
    if(containerId == "1c8224f1-b860-4a2b-821b-d393c94b190d" && (issue.issueTypeId != "318b5e55-0eef-4d61-9059-927fd4d40134" || issue.issueTypeId != "318b5e55-0eef-4d61-9059-927fd4d40134")){
      return;
    };
    // #endregion
    const divSubIcon = document.createElement("div");
    const customAttributes = issue.customAttributes;
    const findHemyXLink = customAttributes.filter(
      (attributes) => attributes.title === "Hemy X Link"
    );
    const hemyLinkAttribute = findHemyXLink[0];
    //   console.log(hemyLinkAttribute);
    let innerSubIcon = "";

    divSubIcon.setAttribute("id", `div-issue-subicon-${issue.id}`);

    const statusDisplay = {
      open: {
        title: "Open",
        color: "#f5bf42",
      },
      draft: {
        title: "Draft",
        color: "#000000",
      },
      pending: {
        title: "Pending",
        color: "#001ee0ff",
      },
      in_review: {
        title: "In Review",
        color: "#8300e0ff",
      },
      closed: {
        title: "Closed",
        color: "#39393bff",
      },
      completed: {
        title: "Closed",
        color: "#39393bff",
      },
    };
    // console.log("TEST:",hemyLinkAttribute);
    // console.log("TEST:",hemyLinkAttribute.value);
    if (hemyLinkAttribute && hemyLinkAttribute.value) {
      innerSubIcon = ` <div class="d-block justify-content-between">
                            <div class="d-flex">
                               <h6 class="mb-1 fw-bold">#${issue.displayId} - ${issue.title
        }</h6>
                            </div>
                            <div class="d-flex" style="height: 20px; align-items: center;">
                                <div style="border-radius: 5px; width: 5px; height: 20px; background-color: ${statusDisplay[issue.status].color
        }"></div>
                                <small class="ms-1">${statusDisplay[issue.status].title
        } &middot;</small>
                                <a id="deviation-${issue.id
        }" target="_blank" href="${hemyLinkAttribute.value
        }" title="Go to record"
                                    style="color: #495057;" class="ms-2">
                                    <svg class="w-[18px] h-[18px] text-gray-800 dark:text-white" aria-hidden="true"
                                        xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none"
                                        viewBox="0 0 24 24">
                                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M3 15v3c0 .5523.44772 1 1 1h9.5M3 15v-4m0 4h9m-9-4V6c0-.55228.44772-1 1-1h16c.5523 0 1 .44772 1 1v5H3Zm5 0v8m4-8v8m7.0999-1.0999L21 16m0 0-1.9001-1.9001M21 16h-5" />
                                    </svg>
                                </a>
                            </div>
                        </div>`;
    } else {
      innerSubIcon = ` <div class="d-block justify-content-between">
                            <div class="d-flex">
                               <h6 class="mb-1 fw-bold">#${issue.displayId} - ${issue.title
        }</h6>
                            </div>
                            <div class="d-flex" style="height: 20px; align-items: center;">
                                <div style="border-radius: 5px; width: 5px; height: 20px; background-color: ${statusDisplay[issue.status].color
        }"></div>
                                <small class="ms-1">${statusDisplay[issue.status].title
        } &middot;</small>
                            </div>
                        </div>`;
    }
    divSubIcon.innerHTML = innerSubIcon;
    divSubIcon.className = "sub-icon issue";

    divSubIcon.onclick = (event) => {
      pushpinExt.selectOne(issue.id);
      $.each(issues, (index, issue_subicon) => {
        const subicon = document.getElementById(
          `div-issue-subicon-${issue_subicon.id}`
        );
        if (
          divSubIcon.getAttribute("id") ===
          `div-issue-subicon-${issue_subicon.id}`
        ) {
          subicon.classList.add("active");
        } else {
          subicon.classList.remove("active");
        }
      });
      //console.log(divSubIcon.getAttribute("id"));
    };

    divIssueSidebar.appendChild(divSubIcon);
  });
}

async function hideToolbar(viewer, toolBars = []) {

  toolBars.forEach((toolbar) => {
    const toolBarType = toolbar.type;
    const toolBarSet = viewer.toolbar.getControl(toolBarType);
    toolbar.toolbarIds.forEach((tbids) => {
      toolBarSet.removeControl(tbids)
    })
  })
}


async function initIssueCreate() {
  pushpinIssueExt = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );

  pushpinIssueExt.startCreateItem({
    label: "New Issue",
    status: "open",
    type: "issues",
  });
  console.log({ g_projectItems });
  pushpinIssueExt.pushPinManager.addEventListener(
    "pushpin.created",
    async function (e) {
      pushpinIssueExt.endCreateItem();
      console.log({ e });
      const newIssue = e.value.itemData;
      const metadata = await getMetadata(newIssue.seedURN);
      console.log(metadata);
      const view = metadata.data.metadata[0];
      const item = g_projectItems.filter(
        (item) =>
          item.latestVersion.relationships.derivatives.data.id ===
          newIssue.seedURN
      )[0];
      //const urn = window.atob(`${newIssue.seedURN}=`);
      //const params = new URLSearchParams(urn);
      //    console.log({ item });
      //      pushpinIssueExt.setDraggableById(newIssue.id, true);
      const issuePayload = {
        title: "New Issue",
        //        description:
        //         "A conflict between the HVAC duct and the structural beam has been identified.",
        status: "open",
        priority: "high",
        //        due_date: "2025-01-22",
        //        assigned_to: {
        //          id: "user_12345", // Replace with a valid user ID
        //          type: "user",
        //        },

        // issue_type: {
        //   id: "67890", // Replace with a valid issue type ID
        //   name: "Clash Detection",
        // },
        issueSubtypeId: "86fb9dd6-fce6-40b3-a49d-0e9437bd8111",
        location: {
          position: newIssue.position,
          view_data: {
            view_id: view.guid, // Replace with the view ID
            object_id: newIssue.objectId, // Replace with the object ID
          },
        },
        placement: {
          type: "3d",
          position: newIssue.position,
          view: view,
          sheet: {
            sheet_id: newIssue.objectData.guid,
            name: newIssue.objectData.viewName,
            urn: newIssue.objectData.urn,
          },
        },
        linkedDocuments: [
          {
            type: "TwoDVectorPushpin",
            urn: item.id,
            createdAtVersion: item.latestVersion.attributes.versionNumber,
            details: {
              viewable: {
                name: newIssue.objectData.viewName,
                is3D: true,
                id: newIssue.objectData.viewableId,
              },
              position: newIssue.position,
              objectId: newIssue.objectId,
              viewerState: newIssue.viewerState,
            },
          },
        ],

        // root_cause: {
        //   id: "123", // Replace with a valid root cause ID
        //   name: "Design Issue",
        // },
        // // custom_attributes: [
        //   {
        //     id: "attribute_1",
        //     value: "Example value 1",
        //   },
        //   {
        //     id: "attribute_2",
        //     value: "Example value 2",
        //   },
        // ],
        // attachments: [
        //   {
        //     urn: "urn:adsk.objects:os.object:bucket-name/file_name.png",
        //     name: "Screenshot.png",
        //   },
        // ],
      };
      //     const newIssueData = await createIssue_v2(issuePayload, selectedProject);
      //      console.log(newIssueData);

      console.log(src);

      if (src) {
        const issueFormPushpin = document.getElementById("input-issue-pushpin");
        if (issueFormPushpin) {
          issueFormPushpin.value = JSON.stringify(issuePayload);
        }
        src.srcWin.postMessage(issuePayload, src.srcOrigin);
      } else {
        alert("There is a problem communicating with IFrame and Powerapps");
        pushpinIssueExt.removeAllItems();
        pushpinIssueExt.startCreateItem({
          label: "New Issue",
          status: "open",
          type: "issues",
        });
        return;
      }
    }
  );
}
// #endregion

// #region: Create Issue v2

// Export for viewer pages
export async function initiateCreateIssueV2(viewer, message, userGuid) {
  const pushpin_ext = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );
  //console.log("Pushpin Extension", pushpin_ext);
  const pushpins = pushpin_ext.pushPinManager.pushPinList;
  const create_issuenotif = document.getElementById("add-issue-notif");
  const btn_close = document.getElementById("btn-cancel-issue-create");

  btn_close.onclick = () => {
    create_issuenotif.classList.add("d-none");
    pushpin_ext.endCreateItem();
    pushpin_ext.showAll();
  };

  create_issuenotif.classList.remove("d-none");
  pushpin_ext.hideAll();

  pushpin_ext.startCreateItem({
    label: "New Issue",
    status: "open",
    type: "issues",
  });

  const model = viewer.model;
  const offset = model?.getData()?.globalOffset || { x: 0, y: 0, z: 0 };

  const upsert_pushpin_details = async (pushpin_item) => {
    const div_loading = document.getElementById("div-loading");
    div_loading.classList.remove("d-none");
    const newIssue = pushpin_item.itemData;
    const metadata = await getMetadata(newIssue.seedURN);
    const view = metadata.data.metadata[0];
    console.log("test_projectItems", g_projectItems);
    let item =
      g_projectItems.find(
        i =>
          i.latestVersion?.relationships?.derivatives?.data?.id ===
          newIssue.seedURN
      ) ||
      g_projectItems.find(
        i =>
          i.relationships?.derivatives?.data?.id ===
          newIssue.seedURN
      );


    console.log("item for issue", item);

    const issuePayload = {
      title: "New Issue",
      status: "open",
      priority: "high",
      issueSubtypeId: "86fb9dd6-fce6-40b3-a49d-0e9437bd8111",
      location: {
        position: newIssue.position,
        view_data: {
          view_id: view.guid, // Replace with the view ID
          object_id: newIssue.objectId, // Replace with the object ID
        },
      },
      placement: {
        type: "3d",
        position: newIssue.position,
        view: view,
        sheet: {
          sheet_id: newIssue.objectData.guid,
          name: newIssue.objectData.viewName,
          urn: newIssue.objectData.urn,
        },
      },
      
      linkedDocuments: [
        {
          type: "TwoDVectorPushpin",
          // urn: item.relationships.item.data.id || item.attributes.id,
          // createdAtVersion: item.attributes.versionNumber || item.latestVersion.attributes.versionNumber,
          //urn: item.relationships?.item?.data?.id ?? item.attributes?.id,
          urn: item.relationships?.item?.data?.id ? item.relationships.item.data.id: item.attributes?.id? item.attributes.id: item.id,
          // urn: item.relationships?.item?.data?.id ?? item.attributes?.id,
          urn:  item.relationships?.item?.data?.id ?? item.attributes?.id ?? item.id,
          createdAtVersion: item.attributes?.versionNumber ?? item.latestVersion?.attributes?.versionNumber,
        
          details: {
            viewable: {
              name: newIssue.objectData.viewName,
              is3D: true,
              id: newIssue.objectData.viewableId,
            },
            position: newIssue.position, // newIssue.position
            objectId: newIssue.objectId,
            viewerState: newIssue.viewerState,
          },
        },
      ]
      // token: localStorage.getItem("authTokenHemyIssue")
    };

    const response = await fetch(`/api/sqlite/pushpin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userGuid,
        details: JSON.stringify(issuePayload),
        new_guid: message.new_guid,
      }),
    });
    const get_details = await fetch(`/api/sqlite/pushpin/${message.new_guid}`);
    const result = await get_details.json();
    console.log(result);
    div_loading.classList.add("d-none");
  };
  pushpin_ext.addEventListener("pushpin.created", async (event) => {
    const pushpin_item = event.value;
    pushpin_ext.setDraggableById(pushpin_item.itemData.id, true);
    pushpin_ext.endCreateItem();

    create_issuenotif.classList.add("d-none");
    await upsert_pushpin_details(pushpin_item);
    //   console.log(event);
  });
  pushpin_ext.addEventListener("pushpin.modified", async (event) => {
    const pushpin_item = event.value;
    await upsert_pushpin_details(pushpin_item);
  });
}
// #endregion


// ! highlight HA/FL
// #region: highlight HA/FL
// Export for viewer pages
export async function navigateHAFL(viewer, ha, fl) {
  const models = viewer.impl.modelQueue().getModels();
  if (!models?.length || models.length < 2) {
    console.warn("⚠️ Need at least 2 fully loaded models before proceeding.");
    navigateHAFL(viewer, ha, fl);
  }

  // Wait for fragment lists to be ready before searching
  await Promise.all(models.map(async (model, index) => {
    await new Promise((resolve) => {
      const waitForFragments = () => {
        const fragList = model.getFragmentList?.();
        if (fragList && fragList.getCount() > 0) {
          console.log(`✅ Model[${index}] fragment list ready (${fragList.getCount()} frags).`);
          resolve();
        } else {
          console.log(`⏳ Waiting for Model[${index}] fragments...`);
          setTimeout(waitForFragments, 300);
        }
      };
      waitForFragments();
    });
  }));

  const searchTerms = [ha, fl].filter(Boolean);
  if (!searchTerms.length) {
    console.warn("⚠️ No valid Hard Asset or Functional Location provided.");
    return;
  }

  console.log("🔍 Searching for:", searchTerms);

  for (const [i, model] of models.entries()) {
    let modelDbIds = [];
    const fragList = model.getFragmentList();
    const instanceTree = model.getData().instanceTree;

    for (const term of searchTerms) {
      await new Promise((resolve) => {
        model.search(
          term,
          async (dbIDs) => {
            if (dbIDs?.length) {
              console.log(`✅ Found ${dbIDs.length} in model[${i}] for: ${term}`);

              for (const dbId of dbIDs) {
                await new Promise((resProp) => {
                  model.getProperties(dbId, (props) => {
                    if (props?.name) modelDbIds.push(dbId);
                    else console.warn(`⚠️ dbId ${dbId} has no name property.`);
                    resProp();
                  });
                });
              }

              const color = new THREE.Vector4(0, 1, 0, 1);
              dbIDs.forEach(id => viewer.setThemingColor(id, color, model));
              viewer.setSelectionColor(new THREE.Color(0, 1, 0));
              viewer.select(dbIDs, model);
            } else {
              console.warn(`⚠️ No matches for ${term} in model[${i}]`);
            }
            resolve();
          },
          (error) => {
            console.error("Search error:", error);
            resolve();
          }
        );
      });
    }

    if (modelDbIds.length === 0) continue;

    const uniqueIds = [...new Set(modelDbIds)];
    console.log(`✅ Model[${i}] isolate/focus for ${uniqueIds.length} dbIDs`, uniqueIds);

    const box = new THREE.Box3();

    for (const id of uniqueIds) {
      const fragIds = [];
      instanceTree.enumNodeFragments(id, fragId => fragIds.push(fragId));

      if (fragIds.length === 0) {
        console.warn(`⚠️ No fragments found for dbId ${id} in model[${i}]`);
        continue;
      }

      fragIds.forEach(fragId => {
        const fragBox = new THREE.Box3();
        fragList.getWorldBounds(fragId, fragBox);
        if (!fragBox.isEmpty()) box.union(fragBox);
      });
    }

    if (box.isEmpty()) {
      console.warn("⚠️ No valid bounding box found, using fitToView.");
      viewer.fitToView(uniqueIds, model);
      continue;
    }

    console.log("✅ Final merged box:", box);

    const targetCenter = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const expandFactor = 1.5;
    box.expandByVector(size.clone().multiplyScalar(expandFactor));

    const nav = viewer.navigation;
    const camera = nav.getCamera();
    if (!camera.isPerspective) nav.toPerspective();

    const radius = size.length() * 1.5;
    const directions = [];
    const numCandidates = 16;

    for (let j = 0; j < numCandidates; j++) {
      const angle = (j / numCandidates) * Math.PI * 2;
      directions.push(
        new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.2).normalize()
      );
    }

    let bestEye = null;
    let bestScore = -Infinity;

    for (const dir of directions) {
      const eye = targetCenter.clone().add(dir.clone().multiplyScalar(radius));
      const raycaster = new THREE.Raycaster(eye, targetCenter.clone().sub(eye).normalize());
      const hits = raycaster.intersectObjects(viewer.impl.scene.children, true);
      const score = -hits.length;
      if (score > bestScore) {
        bestScore = score;
        bestEye = eye;
      }
    }
    
    // viewer.navigation.setWorldUpVector(new THREE.Vector3(0, 0, 1));
    viewer.navigation.setView(bestEye, targetCenter);
    viewer.navigation.orientCameraUp();
    viewer.impl.sceneUpdated(true);

    setTimeout(() => {
      console.log("🔁 Re-applying selection and theming after camera settle");
      viewer.clearSelection();
      viewer.select(uniqueIds, model);
      uniqueIds.forEach(id => {
        viewer.setThemingColor(id, new THREE.Vector4(0, 1, 0, 1), model);
      });
    }, 500);
  }
}

// Helper function to map workset level names to issue level names
function mapLevelName(worksetLevelName) {
  if (!worksetLevelName) return worksetLevelName;
  
  // Map "Level U0" to "level-0", "Level U1" to "level-1", etc.
  if (worksetLevelName.startsWith("Level U")) {
    const levelNumber = worksetLevelName.replace("Level U", "");
    return `level-${levelNumber}`;
  }
  
  // Map "Level 4T" to "level-4", "Level 5T" to "level-5", etc.
  if (worksetLevelName.startsWith("Level ") && worksetLevelName.includes("T")) {
    const levelNumber = worksetLevelName.replace("Level ", "").replace("T", "");
    return `level-${levelNumber}`;
  }
  
  // Map "Level 0" to "level-0", "Level 1" to "level-1", etc.
  if (worksetLevelName.startsWith("Level ") && !worksetLevelName.startsWith("Level U")) {
    const levelNumber = worksetLevelName.replace("Level ", "");
    return `level-${levelNumber}`;
  }
  
  return worksetLevelName;
}

// #region Level Filtering Functions
window.availableLevels = [];
var currentLevelFilter = null;

async function initializeLevelFiltering(allIssues) {
  try {
    console.log("Starting level filtering initialization...");
    
    // Try to get levels from the Levels Extension first
    let levels = [];
    
    try {
      const levelsExt = await viewer.loadExtension("Autodesk.AEC.LevelsExtension");
      console.log("Levels Extension loaded:", levelsExt);
      
      if (levelsExt && levelsExt.floorSelector) {
        const floorData = levelsExt.floorSelector;
        
        // Try different ways to access floor data
        if (floorData._floors) {
          levels = floorData._floors;
          console.log("Found levels via floorSelector._floors:", levels);
        } else if (floorData.floors) {
          levels = floorData.floors;
          console.log("Found levels via floorSelector.floors:", levels);
        }
      }
    } catch (extError) {
      console.log("Levels Extension not available, using fallback method:", extError.message);
    }
    
    // Fallback: Create levels based on issue Z-coordinates
    if (levels.length === 0) {
      console.log("Using fallback level detection based on issue positions");
      
      // Extract Z-coordinates from all issues
      const zCoordinates = [];
      allIssues.forEach((issue, index) => {
        if (issue.linkedDocuments && issue.linkedDocuments.length > 0) {
          const pushpinDetails = issue.linkedDocuments[0].details;
          if (pushpinDetails && pushpinDetails.position) {
            const z = pushpinDetails.position.z || pushpinDetails.position[2] || 0;
            zCoordinates.push(z);
            console.log(`Issue ${index + 1} (${issue.id}): Z = ${z}`);
          } else {
            console.log(`Issue ${index + 1} (${issue.id}): No position data`);
          }
        } else {
          console.log(`Issue ${index + 1} (${issue.id}): No linked documents`);
        }
      });
      
      if (zCoordinates.length === 0) {
        console.log("No Z-coordinates found in issues");
        return [];
      }
      
      // Sort and group Z-coordinates into levels
      zCoordinates.sort((a, b) => a - b);
      console.log("Z-coordinates found:", zCoordinates);
      
      // Create levels by grouping similar Z-coordinates
      const levels = [];
      const tolerance = 2; // 2 units tolerance for same level
      
      zCoordinates.forEach((z, index) => {
        // Check if this Z-coordinate is close to an existing level
        const existingLevel = levels.find(level => Math.abs(z - level.elevation) <= tolerance);
        
        if (!existingLevel) {
          // Create a new level
          const levelName = `Level ${levels.length + 1}`;
          levels.push({
            id: `level-${levels.length}`,
            name: levelName,
            elevation: z
          });
          console.log(`Created new level: ${levelName} (${levelId}) at elevation ${z}`);
        } else {
          console.log(`Z=${z} assigned to existing level: ${existingLevel.name} (elevation=${existingLevel.elevation})`);
        }
      });
      
      // Set global levels
      window.availableLevels = levels;
      console.log(`Created ${levels.length} levels:`, window.availableLevels);
      
      // Show level statistics
      console.log("Level creation summary:");
      levels.forEach((level, index) => {
        const issuesAtLevel = zCoordinates.filter(z => Math.abs(z - level.elevation) <= tolerance);
        console.log(`  ${level.name}: elevation=${level.elevation}, issues=${issuesAtLevel.length}`);
      });
      
      // Update the dropdown with the new levels
      updateDropdownWithLevels();
    }
    
    // Update the dropdown with the new levels
    updateDropdownWithLevels();
  } catch (error) {
    console.error("Error initializing level filtering:", error);
  }
}

function refreshWorksetPanel() {
  // Refresh workset panel to show real levels
  console.log("refreshWorksetPanel called");
  console.log("viewer exists:", !!viewer);
  console.log("viewer.WorksetPanel exists:", !!(viewer && viewer.WorksetPanel));
  console.log("window.availableLevels:", window.availableLevels);
  
  if (viewer && viewer.WorksetPanel) {
    console.log("Refreshing workset panel with real levels...");
    console.log("Available levels count:", window.availableLevels.length);
    viewer.WorksetPanel.createPanelContent();
    console.log("Workset panel refreshed");
  } else {
    console.log("Cannot refresh workset panel - viewer or panel not available");
  }
}

function getLevelForPosition(position) {
  if (!position) {
    return null;
  }
  
  const z = position.z || position[2] || 0;
  
  // Find the closest level based on elevation
  let closestLevel = null;
  let minDistance = Infinity;
  
  if (window.availableLevels && window.availableLevels.length > 0) {
    window.availableLevels.forEach(level => {
      const distance = Math.abs(z - level.elevation);
      if (distance < minDistance) {
        minDistance = distance;
        closestLevel = level;
      }
    });
    
    // Always return the level name for workset levels
    if (closestLevel) {
      if (closestLevel.name && closestLevel.name.includes("Level")) {
        return closestLevel.name; // Return workset name like "Level 1"
      } else {
        return closestLevel.id; // Return auto-generated ID like "level-0"
      }
    }
  }
  
  return null;
}

function createLevelsFromIssuePositions(allIssues) {
  try {
    console.log("Creating levels from issue positions...");
    console.log("Total issues received:", allIssues.length);
    
    // Extract Z-coordinates from all issues
    const zCoordinates = [];
    allIssues.forEach((issue, index) => {
      if (issue.linkedDocuments && issue.linkedDocuments.length > 0) {
        const pushpinDetails = issue.linkedDocuments[0].details;
        if (pushpinDetails && pushpinDetails.position) {
          const z = pushpinDetails.position.z || pushpinDetails.position[2] || 0;
          zCoordinates.push(z);
          console.log(`Issue ${index + 1}: Z = ${z}`);
        } else {
          console.log(`Issue ${index + 1}: No position data`);
        }
      } else {
        console.log(`Issue ${index + 1}: No linked documents`);
      }
    });
    
    if (zCoordinates.length === 0) {
      console.log("No Z-coordinates found in issues");
      return [];
    }
    
    // Sort and group Z-coordinates into levels
    zCoordinates.sort((a, b) => a - b);
    console.log("Z-coordinates found:", zCoordinates);
    
    // Create levels by grouping similar Z-coordinates
    const levels = [];
    const tolerance = 2; // 2 units tolerance for same level
    
    zCoordinates.forEach((z, index) => {
      // Check if this Z-coordinate is close to an existing level
      const existingLevel = levels.find(level => Math.abs(z - level.elevation) <= tolerance);
      
      if (!existingLevel) {
        // Create a new level
        const levelName = `Level ${levels.length + 1}`;
        levels.push({
          id: `level-${levels.length}`,
          name: levelName,
          elevation: z
        });
        console.log(`Created new level: ${levelName} (${levelId}) at elevation ${z}`);
      } else {
        console.log(`Z=${z} assigned to existing level: ${existingLevel.name} (elevation=${existingLevel.elevation})`);
      }
    });
    
    // Set global levels
    window.availableLevels = levels;
    console.log(`Created ${levels.length} levels:`, window.availableLevels);
    
    // Show level statistics
    console.log("Level creation summary:");
    levels.forEach((level, index) => {
      const issuesAtLevel = zCoordinates.filter(z => Math.abs(z - level.elevation) <= tolerance);
      console.log(`  ${level.name}: elevation=${level.elevation}, issues=${issuesAtLevel.length}`);
    });
    
    // Update the dropdown with the new levels
    updateDropdownWithLevels();
  } catch (error) {
    console.error("Error creating levels:", error);
  }
}

function filterByWorkset(worksetName, viewer) {

  worksetCache.forEach((modelMap, model) => {
    const dbIds = modelMap.get(worksetName);

    if (dbIds && dbIds.length > 0) {
      // isolate matching elements
      viewer.isolate(dbIds, model);
    } else {
      // ❗ NO MATCHES → HIDE ENTIRE MODEL
      viewer.hide(model.getRootId(), model);
    }
  });
}

async function performFiltering(levelId) {
  try {
    // Get all issues for the current project
    const filter = {
      "filter[linkedDocumentUrn]": selectedProjectItem.relationships.item.data.id,
    };
    
    let allIssues = [];
    try {
      if (window.getAllIssues) {
        allIssues = await window.getAllIssues(selectedProject, filter);
      } else {
        console.error("getAllIssues not available");
      }
    } catch (error) {
      console.error("Error getting issues:", error);
    }
    
    allIssues = Array.isArray(allIssues) ? allIssues.filter((issue) => issue.status === "open") : [];

    // Get checkbox state for showing closed issues
    const showClosedIssues = false;
    console.log("Show closed issues:", showClosedIssues);
    
    // Filter issues by level and status
    const filteredIssues = levelId ? 
      allIssues.filter(issue => {
        // Check status based on checkbox
        if (!showClosedIssues && issue.status !== 'open') return false;
        if (showClosedIssues && issue.status !== 'open' && issue.status !== 'closed') return false;
        
        const pushpinDetails = issue.linkedDocuments.length > 0 
          ? issue.linkedDocuments[0].details 
          : null;
        
        if (!pushpinDetails) return false;
        
        const issueLevel = getLevelForPosition(pushpinDetails.position);
        return issueLevel === levelId;
      }) : showClosedIssues 
        ? allIssues.filter(issue => issue.status === 'open' || issue.status === 'closed')
        : allIssues.filter(issue => issue.status === 'open');
    
    // Update pushpins with filtered issues
    await updatePushpinsWithFilteredIssues(filteredIssues);
    
    // Update issue list in sidebar
    await populateIssueList("#issues-sidebar-items", filteredIssues);
    
    console.log(`Filtered ${filteredIssues.length} issues for level: ${levelId || 'All Levels'}`);
  } catch (error) {
    console.error("Error performing filtering:", error);
  }
}

async function performFilteringWithGetAllIssues(levelId) {
  try {
    console.log("=== DEBUGGING performFilteringWithGetAllIssues ===");
    console.log("Level ID:", levelId);
    console.log("Using getAllIssues function to get issues...");
    
    // Try to get issues without the filter first
    let allIssues = [];
    try {
      if (window.getAllIssues) {
        allIssues = await window.getAllIssues(selectedProject, {});
      } else {
        console.error("getAllIssues not available");
        return;
      }
    } catch (error) {
      console.log("getAllIssues failed, trying with empty project:", error);
      try {
        if (window.getAllIssues) {
          allIssues = await window.getAllIssues({}, {});
        } else {
          console.error("getAllIssues not available");
          return;
        }
      } catch (error2) {
        console.log("getAllIssues with empty params also failed:", error2);
        return;
      }
    }
    
    console.log(`Retrieved ${allIssues.length} issues using getAllIssues`);
    
    // Use workset levels from model instead of auto-generating from Z-coordinates
    if (!window.availableLevels || window.availableLevels.length === 0) {
      console.log("Using workset levels from model instead of auto-generating...");
      
      // Try to get workset levels from viewer
      try {
        const levelsExt = await viewer.loadExtension("Autodesk.AEC.LevelsExtension");
        console.log("Levels Extension loaded for workset detection:", levelsExt);
        
        if (levelsExt && levelsExt.floorSelector) {
          const floorData = levelsExt.floorSelector;
          
          // Try different ways to access floor data
          let worksetLevels = [];
          if (floorData._floors) {
            worksetLevels = floorData._floors;
            console.log("Found workset levels via floorSelector._floors:", worksetLevels);
          } else if (floorData.floors) {
            worksetLevels = floorData.floors;
            console.log("Found workset levels via floorSelector.floors:", worksetLevels);
          }
          
          if (worksetLevels.length > 0) {
            // Convert workset levels to our format
            window.availableLevels = worksetLevels.map((floor, index) => ({
              id: floor.id || `level-${index}`,
              name: floor.name || floor.title || `Level ${index + 1}`,
              elevation: floor.elevation || floor.level || index
            }));
            
            console.log(`Using ${worksetLevels.length} workset levels from model:`, window.availableLevels);
            return; // Skip auto-generation
          }
        }
      } catch (extError) {
        console.log("Levels Extension not available, falling back to auto-generation:", extError.message);
      }
      
      // Fallback: Create levels from actual issue Z-coordinates if workset levels not available
      console.log("Falling back to auto-generating levels from issue Z-coordinates...");
      const zCoordinates = [];
      
      allIssues.forEach((issue, index) => {
        const pushpinDetails = issue.linkedDocuments && issue.linkedDocuments.length > 0 
          ? issue.linkedDocuments[0].details 
          : null;
        
        if (pushpinDetails && pushpinDetails.position && pushpinDetails.position.z !== undefined) {
          const z = Number(pushpinDetails.position.z);
          zCoordinates.push(z);
          console.log(`Issue ${index + 1}: Z=${z}, ID=${issue.id}, Status=${issue.status}`);
        }
      });
      
      // Sort and group Z-coordinates into levels
      zCoordinates.sort((a, b) => a - b);
      console.log(`Found ${zCoordinates.length} total Z-coordinates`);
      console.log("All Z-coordinates:", zCoordinates);
      
      // Create levels by grouping similar Z-coordinates
      const levels = [];
      const tolerance = 12; // 12 units tolerance for same level
      
      zCoordinates.forEach((z, index) => {
        // Check if this Z-coordinate is close to an existing level
        const existingLevel = levels.find(level => Math.abs(z - level.elevation) <= tolerance);
        
        if (!existingLevel) {
          // Create a new level
          const levelName = `Level ${levels.length + 1}`;
          const levelId = `level-${levels.length}`;
          levels.push({
            id: levelId,
            name: levelName,
            elevation: z
          });
          console.log(`Created new level: ${levelName} (${levelId}) at elevation ${z}`);
        } else {
          console.log(`Z=${z} assigned to existing level: ${existingLevel.name} (elevation=${existingLevel.elevation})`);
        }
      });
      
      // Set global levels
      window.availableLevels = levels;
      console.log(`Created ${levels.length} levels:`, window.availableLevels);
      
      // Show level statistics
      console.log("Level creation summary:");
      levels.forEach((level, index) => {
        const issuesAtLevel = zCoordinates.filter(z => Math.abs(z - level.elevation) <= tolerance);
        console.log(`  ${level.name}: elevation=${level.elevation}, issues=${issuesAtLevel.length}`);
      });
      
      // Update the dropdown with the new levels
      updateDropdownWithLevels();
    }
    
    // Debug: Show what levels are actually detected
    const detectedLevels = new Set();
    allIssues.forEach((issue, index) => {
      const pushpinDetails = issue.linkedDocuments && issue.linkedDocuments.length > 0 
        ? issue.linkedDocuments[0].details 
        : null;
      
      if (pushpinDetails && pushpinDetails.position) {
        const issueLevel = getLevelForPosition(pushpinDetails.position);
        detectedLevels.add(issueLevel);
        if (index < 5) { // Show first 5 for debugging
          console.log(`Issue ${index + 1}: position=${JSON.stringify(pushpinDetails.position)}, detectedLevel=${issueLevel}`);
        }
      }
    });
    console.log(`Detected levels from issues: ${Array.from(detectedLevels).join(', ')}`);
    console.log(`Looking for levelId: ${levelId}`);
    
    // Get checkbox state for showing closed issues
    const showClosedIssues = false;
    console.log("Show closed issues:", showClosedIssues);
    
    // Filter issues by level and status
    console.log(`=== COMPREHENSIVE FILTERING DEBUG ===`);
    console.log(`Filtering ${allIssues.length} issues for level: ${levelId}`);
    console.log(`Show closed issues: ${showClosedIssues}`);
    
    let filteredIssues = [];
    let matchCount = 0;
    let skipCount = 0;
    
    if (levelId) {
      console.log(`=== LEVEL-SPECIFIC FILTERING ===`);
      console.log(`Looking for issues matching level: ${levelId}`);
      
      // Map the workset level name to issue level name
      const mappedLevelId = mapLevelName(levelId);
      console.log(`Mapped level: ${levelId} -> ${mappedLevelId}`);
      
      filteredIssues = allIssues.filter(issue => {
        // Check status based on checkbox
        if (!showClosedIssues) {
          // Only show open issues when checkbox is unchecked
          if (issue.status !== 'open') {
            console.log(`STATUS FILTER: Skipping issue ${issue.id} - status is ${issue.status} (only open allowed)`);
            skipCount++;
            return false;
          }
        }
        // When showClosedIssues is checked, show ALL statuses (no filtering)
        
        const pushpinDetails = issue.linkedDocuments && issue.linkedDocuments.length > 0 
          ? issue.linkedDocuments[0].details 
          : null;
        
        // If no pushpin details, check if we're showing "All Levels" or if this is the right level
        if (!pushpinDetails) {
          console.log(`PUSHPIN FILTER: Issue ${issue.id} has no pushpin details - checking level assignment`);
          
          // For issues without position, show them for "All Levels" or try to assign based on other criteria
          if (!levelId) {
            console.log(`STATUS OK: Issue ${issue.id} - no pushpin details but showing for "All Levels"`);
            return true; // Show for "All Levels"
          } else {
            // For specific levels, skip issues without position data
            console.log(`LEVEL FILTER: Skipping issue ${issue.id} - no position data for level filtering`);
            skipCount++;
            return false;
          }
        }
        
        const issueLevel = getLevelForPosition(pushpinDetails.position);
        console.log(`LEVEL CHECK: Issue ${issue.id} - detected level: ${issueLevel}, looking for: ${mappedLevelId}`);
        
        const matches = issueLevel === mappedLevelId;
        if (matches) {
          console.log(`MATCH: Issue ${issue.id} matches level ${levelId}`);
          matchCount++;
        } else {
          console.log(`LEVEL MISMATCH: Issue ${issue.id} level ${issueLevel} != ${mappedLevelId}`);
        }
        
        return matches;
      });
    } else {
      console.log(`=== ALL LEVELS FILTERING ===`);
      console.log(`Showing all levels (checkbox state: ${showClosedIssues})`);
      
      filteredIssues = allIssues.filter(issue => {
        // Check status based on checkbox
        if (!showClosedIssues) {
          // Only show open issues when checkbox is unchecked
          if (issue.status !== 'open') {
            console.log(`STATUS FILTER: Skipping issue ${issue.id} - status is ${issue.status} (only open allowed)`);
            skipCount++;
            return false;
          }
        }
        // When showClosedIssues is checked, show ALL statuses (no filtering)
        
        if (showClosedIssues) {
          console.log(`STATUS OK: Issue ${issue.id} - status is ${issue.status} (all statuses allowed)`);
        } else {
          console.log(`STATUS OK: Issue ${issue.id} - status is ${issue.status} (open only)`);
        }
        
        return true; // Include all issues for "All Levels"
      });
    }
    
    console.log(`=== FILTERING RESULTS ===`);
    console.log(`Total issues processed: ${allIssues.length}`);
    console.log(`Matches found: ${matchCount}`);
    console.log(`Issues skipped: ${skipCount}`);
    console.log(`Final filtered issues: ${filteredIssues.length}`);

    try {
      const selectedLevel = levelId || "";
      const mappedSelectedLevel = levelId ? mapLevelName(levelId) : "";
      const rows = filteredIssues.slice(0, 50).map((issue) => {
        const pushpinDetails = issue.linkedDocuments && issue.linkedDocuments.length > 0
          ? issue.linkedDocuments[0].details
          : null;
        const position = pushpinDetails?.position || null;
        const detectedLevel = position
          ? getLevelForPosition(position)
          : "";

        return {
          id: issue.id,
          displayId: issue.displayId,
          status: issue.status,
          title: issue.title,
          detectedLevel,
          x: position?.x,
          y: position?.y,
          z: position?.z,
          selectedLevel,
          mappedSelectedLevel,
        };
      });

      console.groupCollapsed(
        `[ACTIVE ISSUES] ${filteredIssues.length} open issue(s) for level="${selectedLevel || "All Levels"}"`
      );
      console.table(rows);
      if (filteredIssues.length > rows.length) {
        console.log(`Showing first ${rows.length} rows (total=${filteredIssues.length}).`);
      }
      console.groupEnd();
    } catch (logError) {
      console.warn("Failed to print active issues table:", logError);
    }
    
    // Update pushpins with filtered issues
    await updatePushpinsWithFilteredIssues(filteredIssues);
    
    // Update issue list in sidebar
    const sidebarItems = document.getElementById("issues-sidebar-items");
    if (sidebarItems) {
      sidebarItems.innerHTML = '';
      
      $.each(filteredIssues, (index, issue) => {
        const issueDiv = document.createElement("div");
        issueDiv.className = `sub-icon issue ${statusColor[issue.status] || 'bg-secondary'}`;
        issueDiv.dataset.issueId = issue.id; // Add data attribute for global click listener
        issueDiv.style.cssText = `
          padding: 10px;
          margin-bottom: 5px;
          border-radius: 5px;
          cursor: pointer;
          border-left: 4px solid ${statusColor[issue.status] || '#6c757d'};
        `;
        
        issueDiv.innerHTML = `
          <div class="d-flex justify-content-between">
            <div class="d-flex" style="height: 20px; align-items: center;">
              <h6 class="mb-1 fw-bold">#${issue.displayId || issue.id} - ${issue.title}</h6>
            </div>
            <div class="d-flex" style="height: 20px; align-items: center;">
              <div style="border-radius: 5px; width: 5px; height: 20px;" class="${statusColor[issue.status] || 'bg-secondary'}"></div>
              <small class="ms-1">${issue.status}</small>
            </div>
          </div>
        `;
        
        // Add a simple test click to verify the element is clickable
        issueDiv.style.cursor = 'pointer';
        issueDiv.style.border = '1px solid red'; // Visual indicator for debugging
        
        sidebarItems.appendChild(issueDiv);
        
        // Test if the click event was attached
        console.log('Issue element created:', issueDiv);
        console.log('Issue element has click listener:', issueDiv.onclick !== null);
      });
    }
    
    console.log(`Filtered ${filteredIssues.length} issues for level: ${levelId || 'All Levels'} (using getAllIssues)`);
  } catch (error) {
    console.error("Error performing filtering with getAllIssues:", error);
  }
}

// Simple test function to check API
async function testApiEndpoint() {
  console.log('=== TESTING API ENDPOINT ===');
  
  // Test with a simple API call first
  try {
    const response = await fetch('/api/issue/test-container/test-issue', {
      headers: {
        'Authorization': `Bearer test-token`
      }
    });
    
    console.log('Test API response status:', response.status);
    console.log('Test API response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Test API error:', errorText);
    }
  } catch (error) {
    console.error('Test API error:', error);
  }
  
  console.log('=== END API TEST ===');
}

// Function to fetch issue thumbnail from ACC API
async function fetchIssueThumbnail(issueId, containerId) {
  try {
    console.log('=== DEBUGGING THUMBNAIL FETCH ===');
    console.log('Issue ID:', issueId);
    console.log('Container ID:', containerId);
    console.log('Selected Project:', selectedProject);
    
    const token = localStorage.getItem('authTokenHemyIssue');
    console.log('Token exists:', !!token);
    console.log('Token length:', token?.length);
    
    // Use selectedProject as fallback if containerId is not provided
    const actualContainerId = containerId || selectedProject;
    console.log('Actual Container ID:', actualContainerId);
    
    if (!actualContainerId) {
      console.error('No container ID provided and no selected project');
      return null;
    }
    
    // Go directly to our thumbnail endpoint instead of the old one
    console.log('=== USING NEW THUMBNAIL ENDPOINT ===');
    
    // Removed test API call - it was interfering with authentication
    
    console.log('=== GOING DIRECTLY TO THUMBNAIL ENDPOINT ===');
    
    // Call the working thumbnail function
    await loadEditIssueThumbnail(issueId, actualContainerId);
    return null;
  } catch (error) {
    console.error('Error fetching issue thumbnail:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Function to load and display thumbnail image (hemy project approach)
async function loadEditIssueThumbnail(issueId, containerId) {
  console.log('=== LOADING EDIT ISSUE THUMBNAIL ===');
  console.log('Issue ID:', issueId);
  console.log('Container ID:', containerId);
  
  const authToken = localStorage.getItem('authTokenHemyIssue');
  const refreshToken = localStorage.getItem('refreshTokenHemyIssue');
  const expiresAt = localStorage.getItem('expires_atHemyIssue');
  const internalToken = localStorage.getItem('internal_tokenHemyIssue');
  const projectId = containerId || window.selectedProject;
  
  console.log('=== AUTHENTICATION DEBUG ===');
  console.log('Auth token exists:', !!authToken);
  console.log('Auth token length:', authToken ? authToken.length : 'null');
  console.log('Auth token value:', authToken ? authToken.substring(0, 20) + '...' : 'null');
  console.log('Refresh token exists:', !!refreshToken);
  console.log('Refresh token length:', refreshToken ? refreshToken.length : 'null');
  console.log('Expires at exists:', !!expiresAt);
  console.log('Expires at value:', expiresAt);
  console.log('Internal token exists:', !!internalToken);
  console.log('Project ID:', projectId);
  console.log('=== END AUTHENTICATION DEBUG ===');
  
  try {
    const resp = await fetch('/api/acc/getIssueThumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'x-refresh-token': refreshToken,
        'x-expires-at': expiresAt,
        'x-internal-token': internalToken
      },
      body: JSON.stringify({ projectId, issueId }),
    });

    if (!resp.ok) {
      console.error('Thumbnail fetch failed:', await resp.text());
      return;
    }

    const data = await resp.json();
    console.log('Thumbnail response data:', data);
    
    if (data?.thumbnailUrl) {
      console.log('=== THUMBNAIL SUCCESS ===');
      console.log('Thumbnail URL received:', data.thumbnailUrl);
      
      // Create a popup to display the thumbnail (since we don't have an Edit panel)
      const popup = document.createElement('div');
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 600px;
        text-align: center;
      `;
      
      popup.innerHTML = `
        <h3>Issue Thumbnail</h3>
        <img src="${data.thumbnailUrl}" style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 4px;" />
        <p style="margin-top: 10px; color: #666; font-size: 14px;">
          Issue ID: ${issueId}<br>
          Project ID: ${projectId}
        </p>
        <button onclick="this.parentElement.remove()" style="
          margin-top: 15px;
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Close</button>
      `;
      
      document.body.appendChild(popup);
      
      console.log('=== THUMBNAIL DISPLAYED ===');
    } else {
      console.log('=== NO THUMBNAIL URL RETURNED ===');
      console.log('Response data:', data);
      
      // Show message that no thumbnail is available
      const popup = document.createElement('div');
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 500px;
        text-align: center;
      `;
      
      const message = data?.message || "The thumbnail image is not accessible through standard Autodesk APIs.";
      
      popup.innerHTML = `
        <h3 style="color: #dc3545; margin-bottom: 15px;">Thumbnail Not Available</h3>
        <p style="color: #666; line-height: 1.5;">
          <strong>Issue ID:</strong> ${issueId}<br>
          <strong>Project ID:</strong> ${projectId}<br><br>
          ${message}
        </p>
        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px; color: #6c757d;">
          <strong>Technical Details:</strong><br>
          This is normal behavior for many Autodesk Construction Cloud issues. 
          The issue data was successfully retrieved, but the thumbnail image 
          is not accessible through Autodesk's OSS APIs.
        </div>
        <button onclick="this.parentElement.remove()" style="
          margin-top: 15px;
          padding: 8px 16px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Close</button>
      `;
      
      document.body.appendChild(popup);
    }
  } catch (err) {
    console.error('Thumbnail load error:', err);
    
    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      text-align: center;
    `;
    
    popup.innerHTML = `
      <h3>Issue Thumbnail</h3>
      <p style="color: #dc3545;">
        <strong>Error Loading Thumbnail</strong><br><br>
        Issue ID: ${issueId}<br><br>
        ${err.message || 'Unknown error occurred'}
      </p>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Close</button>
    `;
    
    document.body.appendChild(popup);
  }
  
  console.log('=== END THUMBNAIL LOAD ===');
}

// Function to download and display thumbnail image (legacy - redirect to new approach)
async function displayIssueThumbnail(snapshotUrn, issueId, containerId) {
  console.log('=== DISPLAYING THUMBNAIL (LEGACY) ===');
  console.log('Redirecting to loadEditIssueThumbnail...');
  console.log('Passing containerId:', containerId);
  
  // Use the working hemy project approach
  await loadEditIssueThumbnail(issueId, containerId);
}

async function performFilteringWithAvailableIssues(levelId, allIssues) {
  try {
    console.log(`=== DEBUGGING performFilteringWithAvailableIssues ===`);
    console.log(`Level ID: ${levelId}`);
    console.log(`All issues parameter length: ${allIssues?.length}`);
    console.log(`All issues parameter:`, allIssues);
    console.log(`Using ${allIssues?.length} available issues for filtering`);
    
    // Filter issues by level and status (only open issues)
    console.log(`=== STARTING FILTERING LOGIC ===`);
    console.log(`Level ID: ${levelId}`);
    console.log(`All issues count at start: ${allIssues?.length}`);
    console.log(`All issues at start:`, allIssues);
    
    const filteredIssues = levelId ? 
      allIssues.filter(issue => {
        // Only show open status issues
        if (issue.status !== 'open') return false;
        
        const pushpinDetails = issue.linkedDocuments && issue.linkedDocuments.length > 0 
          ? issue.linkedDocuments[0].details 
          : null;
        
        if (!pushpinDetails) return false;
        
        const issueLevel = getLevelForPosition(pushpinDetails.position);
        const matches = issueLevel === levelId;
        
        if (!matches) {
          console.log(`ISSUE FILTERED OUT: ${issue.id} - level mismatch: detected=${issueLevel}, looking for=${levelId}`);
        }
        
        return matches;
      }) : allIssues.filter(issue => issue.status === 'open');
    
    console.log(`=== FILTERING RESULTS ===`);
    console.log(`Filtered issues count: ${filteredIssues?.length}`);
    console.log(`Filtered issues:`, filteredIssues);
    
    console.log(`=== FILTERED ISSUES COUNT: ${filteredIssues.length} ===`);
    
    // Update pushpins with filtered issues
    await updatePushpinsWithFilteredIssues(filteredIssues);
    
    // Update issue list in sidebar
    await populateIssueList("#issues-sidebar-items", filteredIssues);
    
    console.log(`Filtered ${filteredIssues.length} issues for level: ${levelId || 'All Levels'} (using available issues)`);
  } catch (error) {
    console.error("Error performing filtering with available issues:", error);
  }
}

// Function to update dropdown with actual levels
function updateDropdownWithLevels() {
  console.log("Updating dropdown with actual levels...");
  const dropdown = document.getElementById("level-filter");
  if (dropdown && window.availableLevels && window.availableLevels.length > 0) {
    console.log("Clearing dropdown and repopulating...");
    dropdown.innerHTML = '';
    
    // Add "All Levels" option
    const allOption = document.createElement('option');
    allOption.value = "";
    allOption.textContent = "All Levels";
    dropdown.appendChild(allOption);
    
    // Update dropdown with workset levels (use workset names as values)
    if (worksetLevels.length > 0) {
      const levelFilter = $("#level-filter");
      if (levelFilter.length > 0) {
        levelFilter.empty();
        levelFilter.append('<option value="">All Levels</option>');
        
        worksetLevels.forEach((level, index) => {
          const option = document.createElement("option");
          option.value = level.name; // Use workset name as value
          option.textContent = level.name; // Use workset name as display text
          levelFilter.append(option);
          console.log(`Added dropdown option: ${level.name} (value: ${level.name})`);
        });
      }
      
      console.log("Dropdown updated with workset levels");
    } else {
      console.log("No workset levels available for dropdown");
    }
    
    // Re-add event listener after repopulation
    dropdown.addEventListener('change', function() {
      console.log("Dropdown change event fired!");
      console.log("Level selected:", this.value);
      console.log("filterIssuesByLevel function exists:", typeof filterIssuesByLevel);
      console.log("window.filterIssuesByLevel exists:", typeof window.filterIssuesByLevel);
      
      // Call the filtering function if it exists
      if (typeof filterIssuesByLevel === 'function') {
        console.log("Calling filterIssuesByLevel directly...");
        filterIssuesByLevel(this.value);
      } else {
        // Try to call it from the global scope
        if (window.filterIssuesByLevel) {
          console.log("Calling window.filterIssuesByLevel...");
          window.filterIssuesByLevel(this.value);
        } else {
          console.log("Filter function not available yet, will try again...");
          // Try again after a delay
          setTimeout(() => {
            if (window.filterIssuesByLevel) {
              window.filterIssuesByLevel(this.value);
            } else {
              console.log("Filter function still not available, project might not be loaded yet");
            }
          }, 1000);
        }
      }
    });
  }
  
  // Add event listener for show/hide closed issues checkbox
  const showClosedCheckbox = document.getElementById('show-closed-issues');
  console.log("Checkbox found:", !!showClosedCheckbox);
  console.log("Checkbox initial checked state:", showClosedCheckbox?.checked);
  
  if (showClosedCheckbox) {
    showClosedCheckbox.addEventListener('change', function() {
      console.log("=== CHECKBOX CHANGE EVENT ===");
      console.log("Show closed issues checkbox changed:", this.checked);
      console.log("Current level filter value:", document.getElementById('level-filter')?.value);
      
      // Trigger filtering with current level to update display - use same function as dropdown
      const currentLevel = document.getElementById('level-filter')?.value || '';
      console.log("Calling performFilteringWithGetAllIssues with level:", currentLevel);
      
      if (typeof performFilteringWithGetAllIssues === 'function') {
        performFilteringWithGetAllIssues(currentLevel);
      } else if (window.performFilteringWithGetAllIssues) {
        console.log("Calling window.performFilteringWithGetAllIssues...");
        window.performFilteringWithGetAllIssues(currentLevel);
      } else {
        console.error("Filtering function not available for checkbox!");
      }
    });
  } else {
    console.error("Show closed issues checkbox not found!");
  }
}

// Add a test button to verify click functionality
const testButton = document.createElement('button');
testButton.textContent = 'Test Thumbnail Popup';
testButton.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 10001;
  background: #007bff;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
`;
testButton.onclick = async function() {
  console.log('=== TEST BUTTON CLICKED ===');
  // Test with the known issue ID
  await loadEditIssueThumbnail('36490c73-427e-4af7-bb6a-1df9791c0277', 'bf8f603c-7e37-4367-9900-69e279377191');
};
document.body.appendChild(testButton);

// Add global click listener to handle issue clicks with event delegation
document.addEventListener('click', function(event) {
  console.log('=== CLICK EVENT FIRED ===');
  console.log('Click target:', event.target);
  console.log('Click target classes:', event.target.className);
  console.log('Click target parent:', event.target.parentElement);
  
  const issueElement = event.target.closest('.sub-icon.issue');
  console.log('Issue element found:', issueElement);
  
  if (issueElement) {
    console.log('=== ISSUE CLICKED (GLOBAL) ===');
    console.log('Issue element clicked:', issueElement);
    console.log('Issue element classes:', issueElement.className);
    console.log('Issue element dataset:', issueElement.dataset);
    
    // Try multiple methods to get the issue ID
    let issueId = issueElement.dataset.issueId;
    console.log('Issue ID from dataset:', issueId);
    
    // Fallback: extract from element ID
    if (!issueId && issueElement.id) {
      const match = issueElement.id.match(/div-issue-subicon-(.+)/);
      if (match) {
        issueId = match[1];
        console.log('Issue ID from element ID:', issueId);
      }
    }
    
    // Fallback: extract from text content
    if (!issueId) {
      const textContent = issueElement.textContent;
      const match = textContent.match(/#(\d+)/);
      if (match) {
        issueId = match[1];
        console.log('Issue ID from text content:', issueId);
      }
    }
    
    console.log('Final Issue ID:', issueId);
    
    if (issueId) {
      console.log('Triggering thumbnail fetch for issue:', issueId);
      
      // Trigger the thumbnail fetch
      (async () => {
        try {
          const containerId = selectedProject;
          console.log('Using container ID:', containerId);
          
          const snapshotUrn = await fetchIssueThumbnail(issueId, containerId);
          
          if (snapshotUrn) {
            console.log('Found thumbnail for issue:', issueId, snapshotUrn);
            await displayIssueThumbnail(snapshotUrn, issueId, containerId);
          } else {
            console.log('No thumbnail available for issue:', issueId);
            // Show a message that no thumbnail is available
            let thumbnailDiv = document.getElementById('issue-thumbnail-display');
            if (!thumbnailDiv) {
              thumbnailDiv = document.createElement('div');
              thumbnailDiv.id = 'issue-thumbnail-display';
              thumbnailDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 10000;
                max-width: 400px;
              `;
              document.body.appendChild(thumbnailDiv);
            }

            thumbnailDiv.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3>No Thumbnail Available</h3>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
              </div>
              <div style="color: #666;">
                This issue does not have a thumbnail image.
              </div>
              <div style="margin-top: 10px; font-size: 12px; color: #666;">
                Issue ID: ${issueId}
              </div>
            `;
          }
        } catch (error) {
          console.error('Error fetching thumbnail:', error);
        }
      })();
    }
    
    console.log('=== END ISSUE CLICK (GLOBAL) ===');
  }
});

window.performFilteringWithGetAllIssues = performFilteringWithGetAllIssues;
window.filterIssuesByLevel = filterIssuesByLevel;
window.updateDropdownWithLevels = updateDropdownWithLevels;

// Main filtering function called from dropdown and workset panel
async function filterIssuesByLevel(levelId) {
  console.log("filterIssuesByLevel called with:", levelId);
  
  // Always use performFilteringWithGetAllIssues as it's more reliable
  console.log("Using performFilteringWithGetAllIssues for filtering");
  await performFilteringWithGetAllIssues(levelId);
}

async function updatePushpinsWithFilteredIssues(filteredIssues) {
  // Ensure pushpin extension is loaded
  if (!pushpinExt) {
    console.log("Pushpin extension not available, trying to load it...");
    try {
      pushpinExt = await viewer.loadExtension("Autodesk.BIM360.Extension.PushPin");
      console.log("Pushpin extension loaded successfully");
    } catch (error) {
      console.error("Failed to load pushpin extension:", error);
      return;
    }
  }
  
  if (!pushpinExt) {
    console.error("Pushpin extension still not available after loading attempt");
    return;
  }
  
  // Clear existing pushpins
  pushpinExt.removeAllItems();
  
  var pushpin = [];
  
  $.each(filteredIssues, (index, issue) => {
    const pushpinDetails = issue.linkedDocuments.length > 0
      ? issue.linkedDocuments[0].details
      : null;

    if (pushpinDetails) {
      const level = getLevelForPosition(pushpinDetails.position);
      
      pushpin.push({
        type: "issues",
        id: issue.id,
        label: issue.title,
        status: issue.status,
        position: pushpinDetails.position,
        objectId: pushpinDetails.objectId,
        viewerState: pushpinDetails.viewerState,
        level: level,
      });
    }
  });
  
  console.log(`Loading ${pushpin.length} pushpins for filtered issues`);
  pushpinExt.loadItemsV2(pushpin);
  attachPushpinHoverTitles(pushpin, 0, pushpinExt);
}

// #endregion

// Workset cache and functions are already defined in workset.mjs
// Import them from there to avoid duplication

function getFirstFragmentDescendants(model, dbId) {
  const it = model.getData().instanceTree;
  const fragIds = [];
  it.enumNodeFragments(dbId, fragId => fragIds.push(fragId));

  if (fragIds.length > 0) return fragIds;

  // No fragments, check children
  const children = [];
  it.enumNodeChildren(dbId, childId => children.push(childId));
  for (const childId of children) {
    const result = getFirstFragmentDescendants(model, childId);
    if (result.length > 0) return result;
  }

  return [];
}