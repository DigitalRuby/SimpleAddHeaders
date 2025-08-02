/* global chrome */
// keys in storage:
//  - domains: { [domain]: { headers:[{name,value}], ruleId:number } }
//  - nextId:  integer (next dynamic rule ID)

const $ = id => document.getElementById(id);
const tableBody = $("rules").querySelector("tbody");

initUI();
$("add").onclick = addOrUpdate;

async function initUI() {
  const { domains = {} } = await chrome.storage.sync.get("domains");
  tableBody.innerHTML = "";
  for (const [dom, info] of Object.entries(domains)) {
    insertRow(dom, info.headers);
  }
}

function insertRow(domain, headers) {
  const tr = document.createElement("tr");
  const hdrTxt = headers.map(h => `${h.name}: ${h.value}`).join("\n");
  tr.innerHTML = `
    <td>${domain}</td>
    <td class="headerCell">${hdrTxt}</td>
    <td class="del" title="Delete">✖</td>`;
  tr.querySelector(".del").onclick = () => removeDomain(domain);
  tableBody.appendChild(tr);
}

async function addOrUpdate() {
  const dom = $("domain").value.trim().toLowerCase();
  const name = $("headerName").value.trim();
  const value = $("headerValue").value.trim();

  if (!dom || !name) return;

  const store = await chrome.storage.sync.get(["domains", "nextId"]);
  const domains = store.domains || {};
  let nextId = store.nextId || 1;

  const hdrs = domains[dom]?.headers || [];
  // replace header value if name exists, else push
  const existing = hdrs.find(h => h.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.value = value; else hdrs.push({ name, value });

  // build rule
  const ruleId = domains[dom]?.ruleId || nextId++;
  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: hdrs.map(h => ({
        header: h.name,
        operation: "set",
        value: h.value
      }))
    },
    condition: {
      requestDomains: [dom],
      resourceTypes: ["xmlhttprequest", "main_frame", "sub_frame", "script"]
    }
  };

  // push to DNR
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: [ruleId]   // remove previous copy (if any)
  });

  // persist
  domains[dom] = { headers: hdrs, ruleId };
  await chrome.storage.sync.set({ domains, nextId });

  // refresh view & clear header boxes
  initUI();
  $("headerName").value = $("headerValue").value = "";
}

async function removeDomain(dom) {
  const store = await chrome.storage.sync.get("domains");
  const domains = store.domains || {};
  const ruleId = domains[dom]?.ruleId;
  if (ruleId) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
  }
  delete domains[dom];
  await chrome.storage.sync.set({ domains });
  initUI();
}
