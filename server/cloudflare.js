"use strict";

class CloudflareClient {
  constructor(creds) {
    this.authType = creds.auth_type || "token";
    this.apiToken = creds.api_token;
    this.zoneId = creds.zone_id;
    this.email = creds.email || "";
    this.accountId = creds.account_id || "";
    this.baseUrl = "https://api.cloudflare.com/client/v4";
  }

  getHeaders() {
    const headers = { "Content-Type": "application/json", "User-Agent": "CFB-Panel/3.0" };
    if (this.authType === "global") {
      headers["X-Auth-Email"] = this.email;
      headers["X-Auth-Key"] = this.apiToken;
    } else {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  async setProxy(domain, fullname, recordType, proxied) {
    const url = `${this.baseUrl}/zones/${this.zoneId}/dns_records?name=${encodeURIComponent(fullname)}&type=${recordType}`;
    const headers = this.getHeaders();

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} querying DNS`);

    const data = await resp.json();
    if (!data.result || data.result.length === 0) {
      throw new Error(`Record not found: ${fullname} ${recordType}`);
    }

    const record = data.result[0];
    if (record.proxied === proxied) return { changed: false };

    const updateResp = await fetch(`${this.baseUrl}/zones/${this.zoneId}/dns_records/${record.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        proxied,
        ttl: proxied ? 1 : 300,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!updateResp.ok) {
      const err = await updateResp.json().catch(() => ({}));
      throw new Error(err.errors?.[0]?.message || `HTTP ${updateResp.status}`);
    }

    return { changed: true, from: record.proxied, to: proxied };
  }

  async listDnsRecords() {
    const allRecords = [];
    let page = 1;
    while (true) {
      const url = `${this.baseUrl}/zones/${this.zoneId}/dns_records?page=${page}&per_page=100`;
      const resp = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        const msg = data.errors?.map((e) => e.message).join("; ") || `HTTP ${resp.status}`;
        throw new Error(`Cloudflare API: ${msg}`);
      }
      allRecords.push(...data.result);
      if (!data.result_info || data.result_info.page >= data.result_info.total_pages) break;
      page++;
    }
    return allRecords;
  }

  async testConnection() {
    const url = `${this.baseUrl}/zones/${this.zoneId}`;
    const resp = await fetch(url, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Connection failed");
    }
    return { ok: true, zone: data.result.name, status: data.result.status };
  }
}

module.exports = { CloudflareClient };
