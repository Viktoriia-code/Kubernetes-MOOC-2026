
const fs = require('node:fs');
const https = require('node:https');
const crypto = require('node:crypto');

const API_SERVER = process.env.KUBERNETES_SERVICE_HOST;
const API_PORT = process.env.KUBERNETES_SERVICE_PORT || '443';
const API_BASE = `https://${API_SERVER}:${API_PORT}`;

const NAMESPACE = process.env.CONTROLLER_NAMESPACE || 'default';
const TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

const WATCH_RETRY_MS = 2000;
const MAX_HTML_BYTES = 900000;
const MAX_ASSET_BYTES = 150000;
const MAX_TOTAL_BYTES = 900000;

const ca = fs.readFileSync(CA_PATH);
const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();

const BASE_PATH =
  `/apis/stable.dwk/v1/namespaces/${NAMESPACE}/dummysites`;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      `${API_BASE}${path}`,
      {
        method: options.method || 'GET',
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let body = '';

          response.on('data', chunk => {
            body += chunk.toString();
          });

          response.on('end', () => {
            const error = new Error(
              `Kubernetes API ${response.statusCode}: ${body}`
            );

            error.status = response.statusCode;
            reject(error);
          });

          return;
        }

        resolve(response);
      }
    );

    request.on('error', reject);

    if (options.body !== undefined) {
      request.write(JSON.stringify(options.body));
    }

    request.end();
  });
}

async function readJson(response) {
  let text = '';

  for await (const chunk of response) {
    text += chunk.toString();
  }

  return text ? JSON.parse(text) : {};
}

async function requestJson(path, options = {}) {
  const response = await apiRequest(path, options);
  return readJson(response);
}

async function applyResource(path, resource) {
  const name = resource.metadata.name;
  const resourcePath = `${path}/${encodeURIComponent(name)}`;

  try {
    const existing = await requestJson(resourcePath);

    resource.metadata.resourceVersion =
      existing.metadata.resourceVersion;

    if (resource.kind === 'Service') {
      resource.spec.clusterIP = existing.spec.clusterIP;

      if (existing.spec.clusterIPs) {
        resource.spec.clusterIPs = existing.spec.clusterIPs;
      }

      if (existing.spec.ipFamilies) {
        resource.spec.ipFamilies = existing.spec.ipFamilies;
      }

      if (existing.spec.ipFamilyPolicy) {
        resource.spec.ipFamilyPolicy = existing.spec.ipFamilyPolicy;
      }
    }

    await requestJson(resourcePath, {
      method: 'PUT',
      body: resource,
    });

    console.log(`Updated ${resource.kind} ${name}`);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }

    try {
      await requestJson(path, {
        method: 'POST',
        body: resource,
      });

      console.log(`Created ${resource.kind} ${name}`);
    } catch (createError) {
      if (createError.status !== 409) {
        throw createError;
      }

      console.log(
        `${resource.kind} ${name} was created concurrently`
      );
    }
  }
}

async function fetchLimited(url, limit, timeout = 15000) {
  const parsed = new URL(url);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported');
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  const chunks = [];
  let size = 0;

  if (!response.body) {
    return {
      data: Buffer.alloc(0),
      contentType: response.headers.get('content-type') || '',
    };
  }

  for await (const chunk of response.body) {
    size += chunk.length;

    if (size > limit) {
      await response.body.cancel().catch(() => {});
      throw new Error(`Content exceeds ${limit} bytes`);
    }

    chunks.push(Buffer.from(chunk));
  }

  return {
    data: Buffer.concat(chunks),
    contentType: response.headers.get('content-type') || '',
  };
}

function absoluteUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

async function inlineAssets(html, websiteUrl) {
  let result = html;

  // Preserve relative URLs when browsing the copied page.
  const baseTag = `<base href="${websiteUrl}">`;

  if (/<head\b[^>]*>/i.test(result)) {
    result = result.replace(
      /<head\b[^>]*>/i,
      match => `${match}\n${baseTag}`
    );
  }

  // Include small external CSS files.
  const stylesheetPattern =
    /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;

  const stylesheets = result.match(stylesheetPattern) || [];

  for (const tag of stylesheets) {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];

    if (!href) continue;

    const url = absoluteUrl(href, websiteUrl);
    if (!url) continue;

    try {
      const asset = await fetchLimited(
        url,
        MAX_ASSET_BYTES
      );

      let css = asset.data.toString('utf8');

      // Resolve relative asset paths inside CSS.
      css = css.replace(
        /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
        (match, quote, value) => {
          const resolved = absoluteUrl(value, url);
          return resolved ? `url("${resolved}")` : match;
        }
      );

      result = result.replace(
        tag,
        `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`
      );
    } catch (error) {
      console.log(`CSS skipped: ${error.message}`);
    }
  }

  // Include small images directly as data URLs.
  const imagePattern = /<img\b[^>]*>/gi;
  const images = result.match(imagePattern) || [];

  for (const tag of images) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];

    if (!src) continue;

    const url = absoluteUrl(src, websiteUrl);
    if (!url) continue;

    try {
      const asset = await fetchLimited(
        url,
        MAX_ASSET_BYTES
      );

      const mime = asset.contentType.split(';')[0].trim();

      if (!mime.startsWith('image/')) continue;

      const dataUrl =
        `data:${mime};base64,${asset.data.toString('base64')}`;

      const updatedTag = tag.replace(
        /\bsrc=["'][^"']+["']/i,
        `src="${dataUrl}"`
      );

      result = result.replace(tag, updatedTag);
    } catch (error) {
      console.log(`Image skipped: ${error.message}`);
    }
  }

  return result;
}

async function fetchWebsite(url) {
  console.log(`Fetching website: ${url}`);

  const response = await fetchLimited(
    url,
    MAX_HTML_BYTES
  );

  let html = response.data.toString('utf8');

  html = await inlineAssets(html, url);

  if (Buffer.byteLength(html, 'utf8') > MAX_TOTAL_BYTES) {
    console.log('Inlined HTML is too large, using original HTML');
    html = response.data.toString('utf8');
  }

  return html;
}

function ownerReferences(site) {
  return [{
    apiVersion: 'stable.dwk/v1',
    kind: 'DummySite',
    name: site.metadata.name,
    uid: site.metadata.uid,
    controller: true,
    blockOwnerDeletion: true,
  }];
}

async function reconcile(site) {
  const namespace = site.metadata.namespace || NAMESPACE;
  const name = site.metadata.name;

  const websiteUrl = site.spec?.website_url;

  if (!websiteUrl) {
    throw new Error(`DummySite ${name} has no website_url`);
  }

  console.log(`Reconciling DummySite ${namespace}/${name}`);

  const labels = {
    'app.kubernetes.io/managed-by': 'dummy-site-controller',
    'dummy-site': name,
  };

  const owners = ownerReferences(site);

  const html = await fetchWebsite(websiteUrl);

  const contentHash = crypto
    .createHash('sha256')
    .update(html)
    .digest('hex');

  const configMapName = `${name}-content`;
  const siteName = `${name}-site`;

  await applyResource(
    `/api/v1/namespaces/${namespace}/configmaps`,
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: configMapName,
        namespace,
        labels,
        ownerReferences: owners,
      },
      data: {
        'index.html': html,
      },
    }
  );

  await applyResource(
    `/apis/apps/v1/namespaces/${namespace}/deployments`,
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: siteName,
        namespace,
        labels,
        ownerReferences: owners,
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: labels,
        },
        template: {
          metadata: {
            labels,
            annotations: {
              'dummy-site/content-hash': contentHash,
            },
          },
          spec: {
            containers: [{
              name: 'web',
              image: 'nginx:1.27-alpine',
              ports: [{
                containerPort: 80,
              }],
              volumeMounts: [{
                name: 'content',
                mountPath: '/usr/share/nginx/html/index.html',
                subPath: 'index.html',
                readOnly: true,
              }],
            }],
            volumes: [{
              name: 'content',
              configMap: {
                name: configMapName,
              },
            }],
          },
        },
      },
    }
  );

  await applyResource(
    `/api/v1/namespaces/${namespace}/services`,
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: siteName,
        namespace,
        labels,
        ownerReferences: owners,
      },
      spec: {
        selector: labels,
        ports: [{
          port: 80,
          targetPort: 80,
        }],
      },
    }
  );

  console.log(`Successfully reconciled ${namespace}/${name}`);
}

async function listDummySites() {
  const response = await requestJson(BASE_PATH);

  return {
    items: response.items || [],
    resourceVersion: response.metadata?.resourceVersion,
  };
}

async function watchDummySites(resourceVersion) {
  const query = new URLSearchParams({
    watch: 'true',
    timeoutSeconds: '300',
  });

  if (resourceVersion) {
    query.set('resourceVersion', resourceVersion);
  }

  const response = await apiRequest(`${BASE_PATH}?${query}`);

  let buffer = '';
  let latestVersion = resourceVersion;

  for await (const chunk of response) {
    buffer += chunk.toString('utf8');

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      const event = JSON.parse(line);

      if (event.object?.metadata?.resourceVersion) {
        latestVersion = event.object.metadata.resourceVersion;
      }

      if (event.type === 'ERROR') {
        throw new Error(
          `Watch error: ${JSON.stringify(event.object)}`
        );
      }

      if (
        event.type === 'ADDED' ||
        event.type === 'MODIFIED'
      ) {
        try {
          await reconcile(event.object);
        } catch (error) {
          console.error(
            `Reconciliation failed for ${event.object?.metadata?.name}: ${error.message}`
          );
        }
      }
    }
  }

  return latestVersion;
}

async function startController() {
  console.log('DummySite controller started');

  while (true) {
    try {
      const result = await listDummySites();

      console.log(
        `Found ${result.items.length} existing DummySite resources`
      );

      for (const site of result.items) {
        try {
          await reconcile(site);
        } catch (error) {
          console.error(
            `Reconciliation failed for ${site.metadata.name}: ${error.message}`
          );
        }
      }

      let resourceVersion = result.resourceVersion;

      while (true) {
        resourceVersion = await watchDummySites(resourceVersion);
      }
    } catch (error) {
      console.error(`Controller error: ${error.message}`);
      await delay(WATCH_RETRY_MS);
    }
  }
}

startController().catch(error => {
  console.error(`Fatal controller error: ${error.message}`);
  process.exit(1);
});
