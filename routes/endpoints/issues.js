/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Developer Acvocacy and Support
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////
require("dotenv").config();

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const formidable = require("formidable");

const config = require("../../config");
const { authRefreshMiddleware } = require("../services/oauth");
const issues_services = require("../services/issues");
const admin_services = require("../services/admin");
const upload = multer({ dest: "./Image_Files/" });
const { ACCESS_TOKEN, APP_BASE_URL } = process.env;
const localStorage = require("localStorage");
const { stringify } = require("querystring");

var issue_def_data_map = {};
router.get(
  "/api/issueDataMap/:projectId/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { projectId, containerId } = req.params;

    try {
      var issueTypes = [];
      issueTypes = await issues_services.getTypesandSubTypes(
        containerId,
        issueTypes,
        0,
        100
      );

      var subTypes = [];
      subTypes = await issues_services.getSubTypes(
        containerId,
        subTypes,
        0,
        100
      );
      var rootCauses = [];
      rootCauses = await issues_services.getRootCauses(
        containerId,
        rootCauses,
        0,
        100
      );
      var projectUsers = [];
      projectUsers = await admin_services.getProjectUsers(
        projectId,
        projectUsers,
        0,
        100
      );

      issue_def_data_map[containerId] = {
        subTypes: subTypes,
        rootCauses: rootCauses,
        projectUsers: projectUsers,
        issueTypes: issueTypes,
      };
      res.end();
    } catch (e) {
      console.error(`/api/issueSubTypes/:containerId:${e.message}`);
      res.end();
    }
  }
);

router.get("/api/issue-payload", async (req, res) => {
  const payload_str = localStorage.getItem("issue_payload");
  res.json(JSON.parse(payload_str));
});

router.post("/api/set-issue-payload", async (req, res) => {
  localStorage.setItem("issue_payload", JSON.stringify(req.body));
  return true;
});

router.get(
  "/api/allIssues/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;

    try {
      const { containerId } = req.params;
      const filter = req.query;
      console.log('Filter Query', filter);
      let allIssues = [];
      let offset = 0;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const batch = await issues_services.getIssues(
          containerId,
          [],
          offset,
          limit,
          filter
        );

        allIssues = allIssues.concat(batch);

        if (batch.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      res.json(allIssues);
    } catch (err) {
      console.error(`/api/allIssues/:containerId`, err);
      res.status(500).end();
    }
  }
);


router.get(
  "/api/issueSubTypes/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId } = req.params;
    try {
      //var subTypes = []
      //subTypes = await issues_services.getSubTypes(containerId,subTypes,0,100)
      var subTypes = issue_def_data_map[containerId].subTypes;
      res.json(subTypes);
    } catch (e) {
      console.error(`/api/issueSubTypes/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);

router.get(
  "/api/issue/:containerId/:issueId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId, issueId } = req.params;
    try {
      //var subTypes = []
      //subTypes = await issues_services.getSubTypes(containerId,subTypes,0,100)
      const issue = await issues_services.getOneIssue(containerId, issueId);
      res.json(issue);
    } catch (e) {
      console.error(`get /api/issue/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);

router.patch(
  "/api/issue/:containerId/:issueId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId, issueId } = req.params;
    const payload = req.body.payload;
    try {
      //var subTypes = []
      //subTypes = await issues_services.getSubTypes(containerId,subTypes,0,100)
      const issue = await issues_services.patchOneIssue(containerId, issueId, JSON.stringify(payload));
      res.json(issue);
    } catch (e) {
      console.error(`patch /api/issue/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);



router.get(
  "/api/issueTypes/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId } = req.params;
    //  console.log(issue_def_data_map)
    try {
      //var subTypes = []
      //const issueTypes = await issues_services.getTypesandSubTypes(containerId,issueTypes,0,100)

      var issueTypes = issue_def_data_map[containerId].issueTypes;
      res.json(issueTypes);
    } catch (e) {
      console.error(`/api/issueTypes/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);

router.get("/api/issue/pushpin/:issueId", async (req, res) => {
  //config.credentials.token_3legged = req.internalOAuthToken.access_token;
  //config.credentials.token_3legged = req.internalOAuthToken.access_token;

  // const { containerId } = req.params;
  //  console.log(issue_def_data_map)
  try {
    //var subTypes = []
    //const issueTypes = await issues_services.getTypesandSubTypes(containerId,issueTypes,0,100)

    //  var issueTypes = issue_def_data_map[containerId].issueTypes;
    res.send({ issueId: req.params.issueId });
  } catch (e) {
    console.error(`/api/issue/pushpin/:issueId:${e.message}`);
    res.status(500).end();
  }
});

router.get(
  "/api/:containerId/issuesTree",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId } = req.params;

    var returnJson = [];
    try {
      if (req.query.id == "#") {
        const filter = req.query.filter;
        //get issues collection with the filter
        var allIssues = [];
        allIssues = await issues_services.getIssues(
          containerId,
          allIssues,
          0,
          100,
          filter
        );

        await Promise.all(
          allIssues.map(async (item) => {
            const jsonTreeId = `issue|id=${item.id}`;
            const title = item.title == null ? "<No Title>" : item.title;

            returnJson.push(
              prepareItemForIssueTree(jsonTreeId, title, "issues", true, {
                containerId: containerId,
                issueId: item.id,
              })
            );
          })
        );
      } else {
        switch (req.query.type) {
          case "issues":
            //some attributes
            returnJson = getIssueContents(containerId, req.query.data.issueId);
            break;
          case "commentscoll":
            var allComments = [];
            allComments = await issues_services.getComments(
              containerId,
              allComments,
              req.query.data.issueId,
              0,
              100
            );

            await Promise.all(
              allComments.map(async (item) => {
                const jsonTreeId = `${item.id}`;
                const creator = issue_def_data_map[
                  containerId
                ].projectUsers.find((i) => i.autodeskId == item.createdBy);
                const title = `created by ${creator.firstName} ${creator.lastName} At ${item.createdAt}`;

                returnJson.push(
                  prepareItemForIssueTree(jsonTreeId, title, "comments", true, {
                    containerId: containerId,
                    created_at: item.createdAt,
                    body: item.body,
                    updated_at: item.updatedAt,
                    created_by: `${creator.firstName} ${creator.lastName}`,
                  })
                );
              })
            );
            break;
          case "attachmentscoll":
            var allAttachments = [];
            allAttachments = await issues_services.getAttachements(
              containerId,
              allAttachments,
              req.query.data.issueId,
              0,
              100
            );

            await Promise.all(
              allAttachments.map(async (item) => {
                const jsonTreeId = `${item.id}`;
                const creator = issue_def_data_map[
                  containerId
                ].projectUsers.find((i) => i.autodeskId == item.createdBy);
                const title = `${item.name}`;

                returnJson.push(
                  prepareItemForIssueTree(
                    jsonTreeId,
                    title,
                    "attachments",
                    false,
                    {
                      attachmentUrn: item.urn,
                      attachmentType: item.attachmentType,
                      createdAt: item.createdAt,
                      urnType: item.urnType,
                      status: item.status,
                      updatedAt: item.updatedAt,
                      createdBy: `${creator.firstName} ${creator.lastName}`,
                    }
                  )
                );
              })
            );
            break;
          case "comments":
            returnJson = getOneComment(req.query.data);
            break;
          case "attachments":
            //returnJson = getOneAttachment(req.query.data);
            //download attachment directly. not display attachment data.
            break;
          case "attributescoll":
            var att = await issues_services.getOneIssue(
              containerId,
              req.query.data.issueId
            );
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `Title:${att.title}`,
                "attributes",
                false,
                {}
              )
            );
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `Description:${att.description}`,
                "attributes",
                false,
                {}
              )
            );
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `Status: ${att.status}`,
                "attributes",
                false,
                {}
              )
            );
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `DueDate: ${att.dueDate}`,
                "attributes",
                false,
                {}
              )
            );
            let rootCause = issue_def_data_map[containerId].rootCauses.find(
              (i) => i.id == att.rootCauseId
            );
            rootCause = rootCause ? rootCause.title : `<Not Found>`;
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `RootCause:${rootCause}`,
                "attributes",
                false,
                {}
              )
            );
            let subType = issue_def_data_map[containerId].subTypes.find(
              (i) => i.id == att.issueSubtypeId
            );
            subType = subType ? subType.title : `<Not Found>`;
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `SubType:${subType}`,
                "attributes",
                false,
                {}
              )
            );
            let assignee = issue_def_data_map[containerId].projectUsers.find(
              (i) => i.autodeskId == att.assignedTo
            );
            assignee = assignee
              ? `${assignee.firstName} ${assignee.lastName}`
              : `<Not Found>`;
            returnJson.push(
              prepareItemForIssueTree(
                "",
                `Assignee: ${assignee}`,
                "attributes",
                false,
                {}
              )
            );

            //linkedDocument (pushpin)
            if (att.linkedDocuments && att.linkedDocuments.length > 0) {
              returnJson.push(
                prepareItemForIssueTree(
                  "",
                  `Linked Document`,
                  "pushpin",
                  true,
                  {
                    id: att.id,
                    status: att.status,
                    title: att.title,
                    linkedDocument: att.linkedDocuments[0],
                  }
                )
              );
            }

            break;
          case "pushpin":
            returnJson = getOnePushpin(req.query.data.linkedDocument);

            //add some required  from issue basic attributes, for creating pushpin in APS viewer.
            returnJson.title = req.query.data.title;
            returnJson.status = req.query.data.status;
            returnJson.id = req.query.data.id;

            break;
        }
      }
      res.json(returnJson);
    } catch (e) {
      console.error(`/api/:containerId/issuesTree:${e.message}`);
      res.end();
    }
  }
);

router.post(
  "/api/createIssue/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId } = req.params;
    const payload = req.body.payload;

    try {
      const r = await issues_services.createIssue(
        containerId,
        JSON.stringify(payload)
      );
      //res.status(200).end();

      res.json(r);
    } catch (e) {
      console.error(`/api/createIssue/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);

// Alternative endpoint for getting issue thumbnails using OSS signed URL approach
router.post('/api/acc/getIssueThumbnail', async (req, res) => {
  console.log('=== ACC THUMBNAIL ENDPOINT (OSS SIGNED URL) ===');
  const { projectId, issueId } = req.body;
  console.log('Project ID:', projectId);
  console.log('Issue ID:', issueId);
  
  // Directly extract token from Authorization header
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7); // Remove 'Bearer ' prefix
    console.log('Extracted token directly from Authorization header:', token ? token.substring(0, 20) + '...' : 'null');
  }
  
  // Set the token for Model Derivative service
  config.credentials.token_3legged = token;
  
  console.log('Token exists:', !!token);
  console.log('Token length:', token ? token.length : 'null');
  
  try {
    // Get the issue data first
    const issue = await issues_services.getOneIssue(projectId, issueId);
    
    if (!issue || !issue.snapshotUrn) {
      console.log('No snapshotUrn found for issue');
      return res.json({ thumbnailUrl: null });
    }
    
    console.log('Found snapshotUrn:', issue.snapshotUrn);
    
    // Extract bucket and object key from URN
    // Format: urn:adsk.objects:os.object:bucket/objectKey
    const urnParts = issue.snapshotUrn.split(':');
    const bucketAndObject = urnParts[urnParts.length - 1];
    const [bucket, objectKey] = bucketAndObject.split('/');
    
    console.log('Extracted bucket:', bucket);
    console.log('Extracted object key:', objectKey);
    
    // Option 1: Try to get a signed URL for the OSS object
    console.log('Trying OSS signed URL approach...');
    
    const signedUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${objectKey}/signeds3download`;
    
    console.log('Signed URL endpoint:', signedUrl);
    
    const signedResponse = await fetch(signedUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "access": "read",
        "useCdn": true,
        "minutesExpiration": 60
      })
    });
    
    console.log('Signed URL response status:', signedResponse.status);
    console.log('Signed URL response ok:', signedResponse.ok);
    
    if (signedResponse.ok) {
      const signedData = await signedResponse.json();
      console.log('Signed URL response:', signedData);
      
      if (signedData.url) {
        console.log('SUCCESS: Returning signed URL:', signedData.url);
        return res.json({ thumbnailUrl: signedData.url });
      } else {
        console.log('No URL in signed response data');
      }
    } else {
      const errorText = await signedResponse.text();
      console.log('Signed URL error response:', errorText);
      console.log('Signed URL failed with status:', signedResponse.status);
    }
    
    // Option 2: Try direct OSS access as fallback
    console.log('Trying direct OSS access as fallback...');
    
    const directUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${objectKey}/content`;
    
    console.log('Direct OSS URL:', directUrl);
    
    const directResponse = await fetch(directUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Direct OSS response status:', directResponse.status);
    console.log('Direct OSS response ok:', directResponse.ok);
    
    if (directResponse.ok) {
      console.log('SUCCESS: Direct OSS access successful');
      
      // Get the content type from the response
      const contentType = directResponse.headers.get('content-type') || 'image/jpeg';
      
      // Convert the response to base64
      const buffer = await directResponse.arrayBuffer();
      const base64Image = Buffer.from(buffer).toString('base64');
      
      const dataUrl = `data:${contentType};base64,${base64Image}`;
      console.log('Returning data URL from direct OSS access');
      
      return res.json({ thumbnailUrl: dataUrl });
    } else {
      const errorText = await directResponse.text();
      console.log('Direct OSS error response:', errorText);
      console.log('Direct OSS failed with status:', directResponse.status);
    }
    
    // Option 3: Try Model Derivative approach (working in hemy project)
    console.log('Trying Model Derivative approach (hemy project method)...');
    
    if (issue.placements && issue.placements.length > 0) {
      const placement = issue.placements[0];
      if (placement.lineageUrn) {
        console.log('Found placement lineageUrn:', placement.lineageUrn);
        
        // Use direct Model Derivative API call (without forge-apis library)
        try {
          console.log('Trying direct Model Derivative API call...');
          
          // Base64 encode the URN for Model Derivative API
          const encodedUrn = Buffer.from(placement.lineageUrn).toString('base64');
          
          // Get the manifest for the model
          const manifestUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodedUrn}/manifest`;
          const manifestResponse = await fetch(manifestUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            console.log('Model Derivative manifest status:', manifest.status);
            
            if (manifest.status === 'success' && manifest.derivatives) {
              // Look for thumbnail in derivatives
              for (const derivative of manifest.derivatives) {
                if (derivative.children) {
                  for (const child of derivative.children) {
                    if (child.role === '2d' && child.children) {
                      for (const subChild of child.children) {
                        if (subChild.role === 'thumbnail' && subChild.urn) {
                          console.log('Found thumbnail URN:', subChild.urn);
                          
                          // Get the thumbnail
                          const thumbnailUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${Buffer.from(subChild.urn).toString('base64')}/thumbnail`;
                          const thumbnailResponse = await fetch(thumbnailUrl, {
                            headers: {
                              'Authorization': `Bearer ${token}`
                            }
                          });
                          
                          if (thumbnailResponse.ok) {
                            const thumbnailBuffer = await thumbnailResponse.arrayBuffer();
                            const thumbnailBase64 = Buffer.from(thumbnailBuffer).toString('base64');
                            console.log('Successfully retrieved thumbnail from Model Derivative API');
                            return res.json({ 
                              thumbnailUrl: `data:image/jpeg;base64,${thumbnailBase64}`,
                              message: 'Thumbnail retrieved via direct Model Derivative API'
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } else {
            console.log('Model Derivative manifest request failed:', manifestResponse.status, manifestResponse.statusText);
          }
        } catch (modelDerivativeError) {
          console.log('Direct Model Derivative API error:', modelDerivativeError.message);
        }
      }
    }
    
    // Option 4: Fallback to placeholder with user feedback
    console.log('All approaches failed - this is normal for many ACC issues');
    console.log('The snapshotUrn exists but the actual image file is not accessible through standard APIs');
    console.log('This is a known limitation of Autodesk Construction Cloud APIs');
    return res.json({ 
      thumbnailUrl: null,
      message: "Thumbnail not available - this is normal for many ACC issues. The issue data was successfully retrieved, but the thumbnail image is not accessible through Autodesk's OSS APIs."
    });
    
  } catch (error) {
    console.error('OSS thumbnail endpoint error:', error);
    console.error('Error stack:', error.stack);
    return res.json({ thumbnailUrl: null });
  }
});

router.post(
  "/api/issue/:containerId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId } = req.params;
    const payload = req.body.payload;

    try {
      const r = await issues_services.createIssue(
        containerId,
        JSON.stringify(payload)
      );
      //res.status(200).end();

      res.send(r);
    } catch (e) {
      console.error(`/api/createIssue/:containerId:${e.message}`);
      res.status(500).end();
    }
  }
);

router.post(
  "/api/createComment/:containerId/:issueId",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId, issueId } = req.params;
    const comment = req.body.comment;
    const payload = {
      issueId: issueId,
      body: comment,
    };
    try {
      const r = await issues_services.addComment(
        containerId,
        issueId,
        JSON.stringify(payload)
      );
      res.status(200).end();
    } catch (e) {
      console.error(`/api/createComments/:containerId/:issueId:${e.message}`);
      res.status(500).end();
    }
  }
);

router.post(
  "/api/createAttachment/:containerId/:issueId",
  authRefreshMiddleware,
  upload.single("png"),
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const { containerId, issueId } = req.params;

    let arr = [];
    const rs = fs.createReadStream(req.file.path);
    const fileName = req.file.originalname;

    rs.on("data", (chunk) => {
      arr.push(chunk);
    });
    rs.on("end", async (chunk) => {
      var fileBody = Buffer.concat(arr);

      try {
        const r = await issues_services.addAttachment(
          containerId,
          issueId,
          fileName,
          fileBody
        );
        if (r == "succeeded") res.status(200).end();
        else res.status(500).end();
      } catch (err) {
        console.error(
          `/api/createAttachment/:containerId/:issueId:${e.message}`
        );
        res.status(500).end();
      }
    });

    // const fileName = req.body.fileName;

    // //read file body
    // const file_full_path = path.join(__dirname, `../../Files/${fileName}`)

    // var fileBody = fs.readFileSync(file_full_path)
    // try {
    //   const r = await issues_services.addAttachment(containerId, issueId, fileName, fileBody);
    //   res.status(200).end();
    // } catch (e) {
    //   console.error(`/api/createAttachment/:containerId/:issueId:${e.message}`)
    //   res.status(500).end()
    // }
  }
);

router.get(
  "/api/downloadAttachment",
  authRefreshMiddleware,
  async (req, res) => {
    config.credentials.token_3legged = req.internalOAuthToken.access_token;
    const urn = req.query.urn;
    const name = req.query.name;

    try {
      const file_full_path_name = await issues_services.downloadAttachment(
        urn,
        name
      );
      res.download(file_full_path_name);
    } catch (e) {
      console.error(`/api/issueSubTypes/:containerId:${e.message}`);
      res.end();
    }
  }
);

router.post("/api/uploadFile", upload.single("png"), async (req, res) => {
  let arr = [];
  const rs = fs.createReadStream(req.file.path);

  rs.on("data", (chunk) => {
    arr.push(chunk);
  });
  rs.on("end", async (chunk) => {
    var fileBody = Buffer.concat(arr);

    try {
      //const r = await issues_services.addAttachment(containerId, issueId, fileName, fileBody);

      res.status(200).end();
    } catch (err) {
      console.error(`/api/createAttachment/:containerId/:issueId:${e.message}`);
      res.status(500).end();
    }
  });
});

function prepareItemForIssueTree(_id, _text, _type, _children, _data) {
  return {
    id: _id,
    text: _text,
    type: _type,
    children: _children,
    data: _data,
  };
}

function getIssueContents(containerId, issueId) {
  var returnJson = [];
  //attributes
  returnJson.push(
    prepareItemForIssueTree("", "Attributes", "attributescoll", true, {
      containerId: containerId,
      issueId: issueId,
    })
  );

  //comments collection
  returnJson.push(
    prepareItemForIssueTree("", "Comments", "commentscoll", true, {
      containerId: containerId,
      issueId: issueId,
    })
  );

  //attachments collection
  returnJson.push(
    prepareItemForIssueTree("", "Attachments", "attachmentscoll", true, {
      containerId: containerId,
      issueId: issueId,
    })
  );

  return returnJson;
}

function getOneComment(commentsData) {
  var returnJson = [];
  returnJson.push(
    prepareItemForIssueTree(
      "",
      "createdAt: " + commentsData.createdAt,
      "commentsdata",
      false
    )
  );

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "createdBy: " + commentsData.createdBy,
      "commentsdata",
      false
    )
  );

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "body: " + commentsData.body,
      "commentsdata",
      false
    )
  );

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "updated_at: " + commentsData.updated_at,
      "commentsdata",
      false
    )
  );
  return returnJson;
}

function getOnePushpin(pushpinData) {
  var returnJson = [];

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "type: " + pushpinData.type,
      "pushpindata",
      false
    )
  );

  returnJson.push(
    prepareItemForIssueTree("", "urn: " + pushpinData.urn, "pushpindata", false)
  );

  var details = pushpinData.details;
  var location = `( ${details.position.x},${details.position.y},${details.position.z})`;
  returnJson.push(
    prepareItemForIssueTree("", "location: " + location, "pushpindata", false)
  );

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "objectId: " + details.objectId,
      "pushpindata",
      false
    )
  );

  returnJson.push(
    prepareItemForIssueTree("", "is3D: " + details.is3D, "pushpindata", false)
  );

  returnJson.push(
    prepareItemForIssueTree(
      "",
      "viewerable_name: " + details.viewable.name,
      "pushpindata",
      false,
      {
        guid: details.viewable.guid,
        viewableId: details.viewable.guid,
      }
    )
  );

  return returnJson;
}

// #region GET Construction Projects
router.get("/api/constructionProjects", async (req, res) => {
  try {
    // 1️⃣ Get token
    const tokenRes = await fetch(`${APP_BASE_URL}/api/auth/twoLeggedToken`);
    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    // 2️⃣ Helper to fetch all pages
    const allProjects = [];
    let nextUrl = "https://developer.api.autodesk.com/construction/admin/v1/accounts/7a656dca-000a-494b-9333-d9012c464554/projects?filter[name]=Construction Project&filterTextMatch=contains";

    while (nextUrl) {
      const accRes = await fetch(nextUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
          Region: "EMEA",
          // "User-Id": "3a15881a-370e-4d72-80f7-8701c4b1806c"
        },
      });

      const accData = await accRes.json();

      // Push results
      if (accData.results?.length) {
        allProjects.push(...accData.results.map(p => ({
          id: p.id,
          name: p.name
        })));
      }

      // Move to next page
      nextUrl = accData.pagination?.nextUrl || null;
    }

    // 3️⃣ Return all results
    res.json(allProjects);

  } catch (err) {
    console.error("Error fetching ACC projects:", err);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});
// #endregion

module.exports = router;
