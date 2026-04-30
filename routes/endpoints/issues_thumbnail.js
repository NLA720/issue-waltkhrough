// Clean OSS signed URL thumbnail endpoint
const express = require('express');
const router = express.Router();
const issues_services = require("../services/issues");
const config = require("../../config");

// Alternative endpoint for getting issue thumbnails using OSS signed URL approach
router.post('/api/acc/getIssueThumbnail', async (req, res) => {
  console.log('=== ACC THUMBNAIL ENDPOINT (OSS SIGNED URL) ===');
  const { projectId, issueId } = req.body;
  console.log('Project ID:', projectId);
  console.log('Issue ID:', issueId);
  
  // Get the proper token
  let token = null;
  if (req.headers.authorization && req.headers.authorization !== 'Bearer test-token') {
    token = req.headers.authorization.replace('Bearer ', '');
  } else if (req.internalOAuthToken && req.internalOAuthToken.access_token && req.internalOAuthToken.access_token !== 'null') {
    token = req.internalOAuthToken.access_token;
  } else if (req.user && req.user.access_token) {
    token = req.user.access_token;
  }
  
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
    
    // Option 3: Fallback to placeholder
    console.log('All OSS approaches failed, returning null');
    return res.json({ thumbnailUrl: null });
    
  } catch (error) {
    console.error('OSS thumbnail endpoint error:', error);
    console.error('Error stack:', error.stack);
    return res.json({ thumbnailUrl: null });
  }
});

module.exports = router;
