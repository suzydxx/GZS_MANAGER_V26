/*
  GZS Manager - script.js
  CONTROLE PROFISSIONAL COMPLETO - UPGRADE (ESTÁVEL)
*/

(function () {

  const LS_KEY = 'gzs_manager_v3';

  function loadStore(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw) return JSON.parse(raw);
    }catch{}
    return {};
  }

  function saveStore(s){
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

  function el(id){ return document.getElementById(id); }

  function money(v){
    return "R$ " + Number(v||0).toFixed(2).replace(".",",");
  }

  const store = loadStore();

  /* ================================
     BLINDAGEM GLOBAL
     ================================ */

  store.config ||= {};
  store.config.admin ||= { user:"gelozonasul", pass:"1234" };
  store.config.settings ||= {
    weeklySalary:350,
    lateLimit:"08:21",
    latePenalty:10,
    mealValue:20,
    dayOffValue:100
  };
  store.config.empresa ||= "GZS Manager";

  store.employees ||= [];
  store.periods ||= {};
  store.vales ||= {};
  store.descontos ||= {};
  store.historico ||= {};

  saveStore(store);

  function ensureEmployeeStores(id){
    store.periods[id] ||= null;
    store.vales[id] ||= [];
    store.descontos[id] ||= [];
    store.historico[id] ||= [];
  }

  function isAtraso(entrada){
    if(!entrada) return false;
    return entrada > store.config.settings.lateLimit;
  }

  /* ================================
     LOGIN
     ================================ */

  function setupLogin(){
    const btn = el("btnLogin");
    if(!btn) return;

    btn.onclick = ()=>{
      if(
        el("user").value === store.config.admin.user &&
        el("pass").value === store.config.admin.pass
      ){
        localStorage.setItem("gzs_logged","1");
        location.href="painel.html";
      } else {
        alert("Usuário ou senha inválidos");
      }
    };
  }

  function protect(){
    const p = location.pathname.split("/").pop();
    if(
      ["painel.html","funcionario.html","configuracoes.html"].includes(p) &&
      localStorage.getItem("gzs_logged")!=="1"
    ){
      location.href="index.html";
    }
  }

  /* ================================
     PAINEL
     ================================ */

  function setupAddEmployee(){
    const btn = el("btnAddEmp");
    if(!btn) return;

    btn.onclick = ()=>{
      const name = prompt("Nome do funcionário:");
      if(!name) return;

      const id = Date.now().toString();
      store.employees.push({
        id,
        name,
        payType:"Quinzenal",
        foodMode:"Acumulado"
      });

      ensureEmployeeStores(id);
      saveStore(store);
      renderEmployeeList();
    };
  }

  function renderEmployeeList(){
    const list = el("empList");
    if(!list) return;

    list.innerHTML = "";

    store.employees.forEach(emp=>{
      const d = document.createElement("div");
      d.className="card";
      d.innerHTML = `
        <strong>${emp.name}</strong>
        <div class="actions">
          <button class="btn">Abrir</button>
        </div>
      `;
      d.querySelector("button").onclick = ()=>{
        location.href="funcionario.html?id="+emp.id;
      };
      list.appendChild(d);
    });
  }

  /* ================================
     VALES (ISOLADO / SEGURO)
     ================================ */

  function setupValesFuncionario(id){
    const btn = el("btnAddVale");
    if(!btn) return;

    btn.onclick = ()=>{
      const valor = prompt("Valor do vale (R$):");
      if(!valor || isNaN(valor)) return alert("Valor inválido");

      const data = prompt("Data do vale (YYYY-MM-DD):");
      if(!data) return;

      store.vales[id].push({ valor:Number(valor), data });
      saveStore(store);
      renderVales(id);
    };

    renderVales(id);
  }

  function renderVales(id){
    const box = el("listaVales");
    if(!box) return;

    if(store.vales[id].length === 0){
      box.innerHTML = "Nenhum vale lançado";
      return;
    }

    box.innerHTML = store.vales[id]
      .map(v => `${v.data} — ${money(v.valor)}`)
      .join("<br>");
  }

  /* ================================
     DESCONTOS EXTRAS (ISOLADO / SEGURO)
     ================================ */

  function setupDescontosFuncionario(id){
    const btn = el("btnAddDesconto");
    if(!btn) return;

    btn.onclick = ()=>{
      const valor = prompt("Valor do desconto (R$):");
      if(!valor || isNaN(valor)) return alert("Valor inválido");

      const motivo = prompt("Motivo do desconto:");
      if(!motivo) return;

      store.descontos[id].push({
        valor:Number(valor),
        motivo,
        data:new Date().toISOString().slice(0,10)
      });

      saveStore(store);
      renderDescontos(id);
    };

    renderDescontos(id);
  }

  function renderDescontos(id){
    const box = el("listaDescontos");
    if(!box) return;

    if(store.descontos[id].length === 0){
      box.innerHTML = "Nenhum desconto lançado";
      return;
    }

    box.innerHTML = store.descontos[id]
      .map(d => `${d.data} — ${money(d.valor)} (${d.motivo})`)
      .join("<br>");
  }

  /* ================================
     FUNCIONÁRIO
     ================================ */

  function renderFuncionario(){
    const id = new URLSearchParams(location.search).get("id");
    const emp = store.employees.find(e=>e.id===id);
    if(!emp) return location.href="painel.html";

    ensureEmployeeStores(id);

    const card = el("pointsCard");

    card.innerHTML = `
      <div class="card">
        <h3>${emp.name}</h3>

        <h4>Período de Apuração</h4>
        <div class="grid">
          <input type="date" id="perInicio" class="input"/>
          <input type="date" id="perFim" class="input"/>
          <button class="btn" id="defPeriodo">Definir período</button>
          <button class="btn danger" id="fecharPeriodo">Fechar período</button>
        </div>

        <div id="periodoAtivo" class="small"></div>
        <div id="tabelaPeriodo"></div>
        <div id="financeiroPeriodo"></div>
      </div>
    `;

    setupValesFuncionario(id);
    setupDescontosFuncionario(id);

    el("defPeriodo").onclick = ()=>{
      const inicio = el("perInicio").value;
      const fim = el("perFim").value;
      if(!inicio || !fim) return alert("Informe o período completo");

      const dias = {};
      let d = new Date(inicio);
      const f = new Date(fim);

      while(d <= f){
        const key = d.toISOString().slice(0,10);
        dias[key] = {
          entrada:"",
          saida:"",
          status:"Presente",
          folgaVenda:"Nenhuma"
        };
        d.setDate(d.getDate()+1);
      }

      store.periods[id] = { inicio, fim, fechado:false, dias };
      saveStore(store);
      renderTabela();
    };

    el("fecharPeriodo").onclick = ()=>{
      if(!store.periods[id]) return;
      store.periods[id].fechado = true;
      saveStore(store);
      renderTabela();
    };

    function renderTabela(){
      const p = store.periods[id];
      if(!p) return;

      el("periodoAtivo").innerText =
        `Período: ${p.inicio} até ${p.fim} ${p.fechado ? "(FECHADO)" : ""}`;

      let totalPresente=0, totalFalta=0, totalAtrasos=0;

      let html = `
        <table class="table">
          <tr>
            <th>Data</th>
            <th>Status</th>
            <th>Folga</th>
            <th>Entrada</th>
            <th>Saída</th>
          </tr>
      `;

      Object.entries(p.dias).forEach(([data,info])=>{
        if(info.status==="Presente") totalPresente++;
        if(info.status==="Falta") totalFalta++;
        if(info.status==="Presente" && isAtraso(info.entrada)) totalAtrasos++;

        html += `
          <tr>
            <td>${data}</td>
            <td>
              <select data-date="${data}" data-d="status">
                <option ${info.status==="Presente"?"selected":""}>Presente</option>
                <option ${info.status==="Falta"?"selected":""}>Falta</option>
                <option ${info.status==="Folga"?"selected":""}>Folga</option>
              </select>
            </td>
            <td>
              <select data-date="${data}" data-d="folgaVenda">
                <option ${info.folgaVenda==="Nenhuma"?"selected":""}>Nenhuma</option>
                <option ${info.folgaVenda==="Paga"?"selected":""}>Paga</option>
                <option ${info.folgaVenda==="Acumulada"?"selected":""}>Acumulada</option>
              </select>
            </td>
            <td><input type="time" data-d="entrada" data-date="${data}" value="${info.entrada}"></td>
            <td><input type="time" data-d="saida" data-date="${data}" value="${info.saida}"></td>
          </tr>
        `;
      });

      html += "</table>";
      el("tabelaPeriodo").innerHTML = html;

      el("tabelaPeriodo").querySelectorAll("input,select").forEach(inp=>{
        inp.onchange = ()=>{
          const d = inp.dataset.date;
          const k = inp.dataset.d;
          p.dias[d][k] = inp.value;
          saveStore(store);
          renderTabela();
        };
      });

      const valorDia = store.config.settings.weeklySalary / 6;
      const salarioBase = totalPresente * valorDia;
      const totalVales = store.vales[id].reduce((s,v)=>s+v.valor,0);
      const totalDescontos = store.descontos[id].reduce((s,d)=>s+d.valor,0);

      const salarioFinal =
        salarioBase -
        (totalFalta * valorDia) -
        (totalAtrasos * store.config.settings.latePenalty) -
        totalVales -
        totalDescontos;

      el("financeiroPeriodo").innerHTML = `
        <div class="card">
          <strong>Salário Final: ${money(salarioFinal)}</strong>
        </div>
      `;
    }

    if(store.periods[id]) renderTabela();
  }

  function init(){
    setupLogin();
    protect();

    const p = location.pathname.split("/").pop();
    if(p==="painel.html"){ renderEmployeeList(); setupAddEmployee(); }
    if(p==="funcionario.html"){ renderFuncionario(); }
  }

  document.readyState==="loading"
    ? document.addEventListener("DOMContentLoaded",init)
    : init();

})();