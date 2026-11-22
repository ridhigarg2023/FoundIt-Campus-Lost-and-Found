const API = "/api";
const token = () => localStorage.getItem("foundit_token");
const user = () => {
  try { return JSON.parse(localStorage.getItem("foundit_user") || "null"); }
  catch { return null; }
};
const api = async (path, options = {}) => {
  const headers = options.body instanceof FormData ? {} : {"Content-Type":"application/json"};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(API + path, {...options, headers:{...headers,...options.headers}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong");
  return data;
};
const message = (text, isError=false) => {
  const el = document.getElementById("formMessage");
  if (el) { el.textContent=text; el.classList.toggle("error",isError); }
};
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText = value => value ? new Date(value).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "Date not specified";
const imageUrl = path => path ? path : "https://placehold.co/600x400?text=FoundIt+Item";

function setupNav() {
  const current = user();
  const login = document.getElementById("loginLink");
  const signup = document.getElementById("signupLink");
  const dashboard = document.getElementById("dashboardLink");
  const logout = document.getElementById("logoutBtn");
  if (current) {
    if(login) login.hidden=true;
    if(signup) signup.hidden=true;
    if(dashboard) dashboard.hidden=false;
    if(logout) logout.hidden=false;
  }
  if(logout) logout.addEventListener("click",()=>{localStorage.removeItem("foundit_token");localStorage.removeItem("foundit_user");location.href="index.html";});
  const toggle=document.getElementById("menuToggle");
  const nav=document.getElementById("mainNav");
  if(toggle&&nav) toggle.addEventListener("click",()=>nav.classList.toggle("open"));
}
function itemCard(item) {
  const status = item.status === "returned" ? "returned" : item.status;
  return `<article class="item-card">
    <img src="${safe(imageUrl(item.image_url))}" alt="${safe(item.title)}" onerror="this.src='https://placehold.co/600x400?text=FoundIt'">
    <div class="item-info"><span class="status ${safe(status)}">${safe(status)}</span>
    <h3>${safe(item.title)}</h3><p>📍 ${safe(item.location)}</p>
    <p>📅 ${dateText(item.item_date)}</p><span class="category">${safe(item.category)}</span>
    <button class="details-btn" data-item-id="${item.id}">View Details</button></div></article>`;
}
async function loadHome() {
  const grid=document.getElementById("itemGrid");
  if(!grid) return;
  try {
    const [items,stats]=await Promise.all([api("/items"),api("/stats")]);
    document.getElementById("totalItems").textContent=stats.active;
    document.getElementById("lostCount").textContent=stats.lost;
    document.getElementById("foundCount").textContent=stats.found;
    document.getElementById("returnedCount").textContent=stats.returned;
    grid.innerHTML=items.length?items.map(itemCard).join(""):'<div class="empty-state">No reports yet. Be the first to report an item.</div>';
    grid.addEventListener("click",async e=>{
      const btn=e.target.closest("[data-item-id]");
      if(!btn) return;
      try {
        const item=await api(`/items/${btn.dataset.itemId}`);
        const detail=`${item.title}\nStatus: ${item.status}\nCategory: ${item.category}\nLocation: ${item.location}\nDate: ${dateText(item.item_date)}\nDescription: ${item.description}`;
        if(item.status==="found" && user()) {
          if(confirm(detail+"\n\nWould you like to submit a claim?")) {
            const proof=prompt("Describe a detail that helps verify this item belongs to you:");
            if(proof) { await api("/claims",{method:"POST",body:JSON.stringify({item_id:item.id,proof})}); alert("Claim submitted. The admin will review it."); }
          }
        } else alert(detail + (item.status==="found" ? "\n\nLogin to submit a claim." : ""));
      } catch(err) { alert(err.message); }
    });
    setupSearch(items);
  } catch(err) {
    grid.innerHTML=`<div class="empty-state">Could not load items. Make sure the server and MySQL are running.<br>${safe(err.message)}</div>`;
  }
}
function setupSearch(items) {
  const input=document.getElementById("searchInput"),status=document.getElementById("statusFilter"),btn=document.getElementById("searchBtn");
  const filters=[...document.querySelectorAll(".filter")];
  let category="all";
  const apply=()=>{
    const q=(input?.value||"").toLowerCase().trim(),s=status?.value||"all";
    const filtered=items.filter(i=>(s==="all"||i.status===s)&&(category==="all"||i.category.toLowerCase()===category)&&`${i.title} ${i.description} ${i.location} ${i.category}`.toLowerCase().includes(q));
    document.getElementById("itemGrid").innerHTML=filtered.length?filtered.map(itemCard).join(""):'<div class="empty-state">No matching reports found.</div>';
    const results=document.getElementById("resultsMessage"); if(results) results.textContent=`Showing ${filtered.length} matching report(s).`;
  };
  btn?.addEventListener("click",apply);input?.addEventListener("input",apply);status?.addEventListener("change",apply);
  filters.forEach(f=>f.addEventListener("click",()=>{filters.forEach(x=>x.classList.remove("active"));f.classList.add("active");category=f.dataset.category;apply();}));
}
async function handleSignup() {
  const form=document.getElementById("signupForm");if(!form)return;
  form.addEventListener("submit",async e=>{e.preventDefault();message("Creating your account...");
    const data=Object.fromEntries(new FormData(form).entries());
    try{const result=await api("/auth/register",{method:"POST",body:JSON.stringify(data)});localStorage.setItem("foundit_token",result.token);localStorage.setItem("foundit_user",JSON.stringify(result.user));location.href="dashboard.html";}
    catch(err){message(err.message,true);}
  });
}
async function handleLogin() {
  const form=document.getElementById("loginForm");if(!form)return;
  form.addEventListener("submit",async e=>{e.preventDefault();message("Signing in...");
    const data=Object.fromEntries(new FormData(form).entries());
    try{const result=await api("/auth/login",{method:"POST",body:JSON.stringify(data)});localStorage.setItem("foundit_token",result.token);localStorage.setItem("foundit_user",JSON.stringify(result.user));location.href=result.user.role==="admin"?"admin.html":"dashboard.html";}
    catch(err){message(err.message,true);}
  });
}
function setupImagePreview() {
  const input=document.getElementById("itemImage"),preview=document.getElementById("imagePreview");
  if(!input||!preview)return;
  input.addEventListener("change",()=>{const file=input.files[0];if(!file){preview.hidden=true;return;}if(file.size>5*1024*1024){input.value="";message("Image must be 5 MB or smaller.",true);return;}preview.src=URL.createObjectURL(file);preview.hidden=false;});
}
function handleReport() {
  const form=document.getElementById("reportForm");if(!form)return;
  const params=new URLSearchParams(location.search),type=params.get("type");
  if(type==="found"||type==="lost") form.elements.status.value=type;
  form.elements.item_date.value=new Date().toISOString().slice(0,10);
  setupImagePreview();
  form.addEventListener("submit",async e=>{e.preventDefault();if(!token()){message("Please login before submitting a report.",true);setTimeout(()=>location.href="login.html",1300);return;}
    message("Submitting report...");
    try{const result=await api("/items",{method:"POST",body:new FormData(form)});message("Report submitted successfully!");form.reset();document.getElementById("imagePreview").hidden=true;alert(result.message);location.href="dashboard.html";}
    catch(err){message(err.message,true);}
  });
}
async function loadDashboard() {
  const root=document.getElementById("myReports");if(!root)return;
  if(!token()){location.href="login.html";return;}
  const current=user();document.getElementById("welcomeText").textContent=current?`Signed in as ${current.name}`:"";
  try {
    const data=await api("/my/dashboard");
    root.innerHTML=data.items.length?data.items.map(itemCard).join(""):'<div class="empty-state">You have not submitted any reports yet.</div>';
    document.getElementById("myClaims").innerHTML=data.claims.length?data.claims.map(c=>`<tr><td>${safe(c.item_title)}</td><td>${dateText(c.created_at)}</td><td>${safe(c.status)}</td></tr>`).join(""):'<tr><td colspan="3">No claim requests yet.</td></tr>';
  } catch(err){message(err.message,true);}
}
async function loadAdmin() {
  const body=document.getElementById("adminClaimsBody");if(!body)return;
  if(!token()){location.href="login.html";return;}
  try {
    const data=await api("/admin/dashboard");
    document.getElementById("adminTotal").textContent=data.stats.total;
    document.getElementById("adminClaims").textContent=data.stats.pending;
    document.getElementById("adminReturned").textContent=data.stats.returned;
    body.innerHTML=data.claims.length?data.claims.map(c=>`<tr><td>${safe(c.item_title)}</td><td>${safe(c.claimant_name)}<br>${safe(c.claimant_email)}</td><td>${safe(c.proof)}</td><td><button class="table-action approve" data-claim="${c.id}" data-action="approved">Approve</button><button class="table-action reject" data-claim="${c.id}" data-action="rejected">Reject</button></td></tr>`).join(""):'<tr><td colspan="4">No pending claims.</td></tr>';
    document.getElementById("adminItems").innerHTML=data.items.map(itemCard).join("")||'<div class="empty-state">No items.</div>';
    body.addEventListener("click",async e=>{const b=e.target.closest("[data-claim]");if(!b)return;try{await api(`/admin/claims/${b.dataset.claim}`,{method:"PATCH",body:JSON.stringify({status:b.dataset.action})});loadAdmin();}catch(err){alert(err.message);}});
  } catch(err){body.innerHTML=`<tr><td colspan="4">${safe(err.message)}. Make sure this account has admin role.</td></tr>`;}
}
document.addEventListener("DOMContentLoaded",()=>{
  setupNav();handleSignup();handleLogin();handleReport();loadHome();loadDashboard();loadAdmin();
  const year=document.getElementById("year");if(year)year.textContent=new Date().getFullYear();
});