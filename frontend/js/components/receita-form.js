// Formulário de receita, usado em "Nova receita" (modo "criar") e em "Editar" no detalhe (modo "editar").
// Regras que espelham o backend (routes/receita.py e schemas/receita.py):
//  - Uma receita por produto (inclusive inativa): na criação só aparecem produtos ativos que ainda não têm receita.
//  - O produto fabricado não muda depois de criada a receita.
//  - Rendimento e quantidades > 0, com até 3 casas; as quantidades dos insumos são "por rendimento".
//  - Insumos: só produtos ativos marcados como insumo; sem repetir; o produto não pode ser insumo da própria receita.
//  - Insumo que ficou inativo (ou deixou de ser insumo) depois de entrar na receita aparece com aviso:
//    o servidor recusa salvar com ele, então é preciso removê-lo ou trocá-lo.
//
// Uso:
//   const form = criarFormularioReceita(document.getElementById("receita-form"), { modo: "criar" });
//   await form.pronto;
//   const problema = form.validar();  const payload = form.montarPayload();  form.alterado();

function criarFormularioReceita(raiz, { modo = "criar", receita = null, aoMudar = () => {} } = {}) {
  const editando = modo === "editar";

  let produtosTodos = [];
  let produtosPorId = {};
  let siglasPorUnidade = {};
  let produtoFabricadoId = editando ? receita.produto_id : null;
  let itens = [];                 // [{ uid, produto_id, quantidade, erro }]
  let proximoUid = 1;
  let instantaneoInicial = "";

  raiz.innerHTML = `
    <section class="cartao">
      <h2 class="cartao__titulo">Dados da Receita</h2>
      <div class="cartao-grade">

        <div class="campo-form" id="rf-grupo-produto">
          <label for="rf-produto">Produto fabricado *</label>
          <select id="rf-produto" disabled><option value="">Carregando...</option></select>
          <span class="campo-erro-msg">Selecione o produto fabricado.</span>
          <span class="dica" id="rf-dica-produto"></span>
        </div>

        <div class="campo-form" id="rf-grupo-rendimento">
          <label for="rf-rendimento">Rendimento *</label>
          <div class="campo-com-sigla">
            <input type="number" id="rf-rendimento" min="0" step="0.001" inputmode="decimal" placeholder="Ex.: 10">
            <span class="campo-com-sigla__sigla" id="rf-sigla-rendimento"></span>
          </div>
          <span class="campo-erro-msg" id="rf-erro-rendimento">Informe um rendimento maior que zero.</span>
          <span class="dica">Quanto esta receita produz de uma vez. As quantidades dos insumos abaixo valem para esse rendimento.</span>
        </div>

        <div class="campo-form cartao-grade--cheia">
          <label for="rf-observacao">Observação</label>
          <textarea id="rf-observacao" maxlength="255"></textarea>
          <span class="contador-caracteres" id="rf-contador">0/255</span>
        </div>

      </div>
    </section>

    <section class="cartao">
      <div class="cartao__topo">
        <h2 class="cartao__titulo">Insumos</h2>
        <button type="button" class="botao-secundario" id="rf-adicionar" disabled>+ Adicionar insumo</button>
      </div>
      <table class="tabela-itens-pedido">
        <thead>
          <tr>
            <th class="col-produto">Insumo</th>
            <th class="col-sigla">Quantidade</th>
            <th class="col-custo">R$ Un.</th>
            <th class="col-subtotal">Subtotal</th>
            <th class="col-acao"><span class="sr-only">Remover</span></th>
          </tr>
        </thead>
        <tbody id="rf-corpo"></tbody>
      </table>
      <div class="itens-vazio-novo" id="rf-vazio">Nenhum insumo adicionado. Use “+ Adicionar insumo”.</div>
      <div class="resumo-custos">
        <div class="resumo-custos__bloco">
          <span class="resumo-custos__rotulo">Custo da receita</span>
          <span class="resumo-custos__valor" id="rf-custo-total">R$ 0,00</span>
        </div>
        <div class="resumo-custos__bloco">
          <span class="resumo-custos__rotulo" id="rf-rotulo-unitario">Custo por unidade</span>
          <span class="resumo-custos__valor resumo-custos__valor--secundario" id="rf-custo-unitario">—</span>
        </div>
      </div>
      <p class="nota-cartao">O custo usa o custo cadastrado de cada insumo. O custo real fica gravado na ordem quando a produção é confirmada.</p>
    </section>`;

  const $ = (id) => raiz.querySelector("#" + id);
  const el = {
    grupoProduto: $("rf-grupo-produto"), produto: $("rf-produto"), dicaProduto: $("rf-dica-produto"),
    grupoRendimento: $("rf-grupo-rendimento"), rendimento: $("rf-rendimento"), siglaRendimento: $("rf-sigla-rendimento"),
    erroRendimento: $("rf-erro-rendimento"),
    observacao: $("rf-observacao"), contador: $("rf-contador"),
    adicionar: $("rf-adicionar"), corpo: $("rf-corpo"), vazio: $("rf-vazio"),
    custoTotal: $("rf-custo-total"), custoUnitario: $("rf-custo-unitario"), rotuloUnitario: $("rf-rotulo-unitario")
  };

  const arredondar2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const itemPorUid = (uid) => itens.find(i => i.uid === Number(uid));
  const siglaDe = (produto) => siglasPorUnidade[produto?.unidade_medida_id] || "";

  function casasDecimaisOk(valor, casas) {
    const fator = 10 ** casas;
    return Math.abs(valor * fator - Math.round(valor * fator)) < 1e-6;
  }

  function rotuloTipo(p) {
    if (p.e_insumo && p.e_vendavel) return "Insumo + Vendável";
    return p.e_insumo ? "Insumo" : "Vendável";
  }

  // O insumo está apto a ficar na receita? (ativo e marcado como insumo)
  const insumoApto = (p) => Boolean(p && p.ativo && p.e_insumo);

  // ---------- Produto fabricado ----------

  function montarProdutoFabricado(idsComReceita) {
    if (editando) {
      const atual = produtosPorId[receita.produto_id];
      el.produto.innerHTML = `<option value="">${escaparHtml(atual ? atual.nome : receita.produto_nome)}</option>`;
      el.produto.disabled = true;
      el.dicaProduto.textContent = "O produto fabricado não pode ser trocado.";
      return;
    }
    const disponiveis = produtosTodos
      .filter(p => p.ativo && !idsComReceita.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (disponiveis.length === 0) {
      el.produto.innerHTML = '<option value="">Nenhum produto disponível</option>';
      el.produto.disabled = true;
      el.dicaProduto.textContent = "Todos os produtos ativos já têm receita.";
      return;
    }
    el.produto.innerHTML = '<option value="">Selecione...</option>' + disponiveis.map(p => {
      const sigla = siglaDe(p);
      return `<option value="${p.id}">${escaparHtml(sigla ? `${p.nome} (${sigla})` : p.nome)} — ${rotuloTipo(p)}</option>`;
    }).join("");
    el.produto.disabled = false;
    el.dicaProduto.textContent = "Produtos que já têm receita não aparecem: edite a receita existente.";
  }

  function atualizarSiglaRendimento() {
    const p = produtosPorId[produtoFabricadoId];
    el.siglaRendimento.textContent = p ? siglaDe(p) : "";
    el.rotuloUnitario.textContent = p && siglaDe(p) ? `Custo por ${siglaDe(p)}` : "Custo por unidade";
  }

  // ---------- Cálculos ----------

  const custoDoItem = (item) => {
    const p = produtosPorId[item.produto_id];
    return p ? Number(p.preco_custo || 0) : 0;
  };
  const subtotalDoItem = (item) => (item.produto_id && Number(item.quantidade) > 0)
    ? arredondar2(Number(item.quantidade) * custoDoItem(item)) : 0;

  function atualizarResumo() {
    const total = arredondar2(itens.reduce((soma, i) => soma + subtotalDoItem(i), 0));
    const rendimento = Number(el.rendimento.value);
    el.custoTotal.textContent = formatarMoeda(total);
    el.custoUnitario.textContent = rendimento > 0 && itens.length > 0 ? formatarMoeda(Math.round(total / rendimento * 10000) / 10000) : "—";
    el.vazio.hidden = itens.length > 0;
  }

  // ---------- Itens ----------

  // Opções do select: aptos (ou o já escolhido, mesmo que tenha ficado inapto), sem o fabricado.
  function montarOpcoes(select, selecionado, usadosPorOutros) {
    const opcoes = ['<option value="">Selecione...</option>'];
    produtosTodos
      .filter(p => p.id !== Number(produtoFabricadoId) && (insumoApto(p) || String(p.id) === String(selecionado)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach(p => {
        const ehSelecionado = String(p.id) === String(selecionado);
        const bloquear = !ehSelecionado && usadosPorOutros.has(p.id);
        const sigla = siglaDe(p);
        let texto = sigla ? `${p.nome} (${sigla})` : p.nome;
        if (!p.ativo) texto += " — inativo";
        else if (!p.e_insumo) texto += " — não é insumo";
        opcoes.push(`<option value="${p.id}"${ehSelecionado ? " selected" : ""}${bloquear ? " disabled" : ""}>${escaparHtml(texto)}</option>`);
      });
    select.innerHTML = opcoes.join("");
  }

  function sincronizarSelects() {
    el.corpo.querySelectorAll("tr[data-uid]").forEach(tr => {
      const uid = Number(tr.dataset.uid);
      const item = itemPorUid(uid);
      const usados = new Set(itens.filter(i => i.uid !== uid && i.produto_id).map(i => Number(i.produto_id)));
      montarOpcoes(tr.querySelector('[data-campo="produto_id"]'), item.produto_id, usados);
    });
  }

  function criarLinha(item) {
    const tr = document.createElement("tr");
    tr.dataset.uid = item.uid;
    tr.innerHTML = `
      <td class="col-produto">
        <select data-campo="produto_id" aria-label="Insumo"></select>
        <span class="item-aviso" hidden></span>
      </td>
      <td class="col-sigla">
        <div class="campo-com-sigla">
          <input type="number" data-campo="quantidade" min="0" step="0.001" inputmode="decimal" aria-label="Quantidade do insumo" value="${escaparHtml(item.quantidade)}">
          <span class="campo-com-sigla__sigla" data-sigla></span>
        </div>
      </td>
      <td class="col-custo" data-custo>—</td>
      <td class="col-subtotal" data-subtotal>—</td>
      <td class="col-acao">
        <button type="button" class="botao-lixeira" data-remover aria-label="Remover insumo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>`;
    return tr;
  }

  // Atualiza só o que depende do valor digitado (sem recriar a linha, para o cursor não sair do campo).
  function atualizarLinha(tr) {
    const item = itemPorUid(tr.dataset.uid);
    if (!item) return;
    const produto = produtosPorId[item.produto_id];

    tr.querySelector("[data-sigla]").textContent = produto ? siglaDe(produto) : "";
    tr.querySelector("[data-custo]").textContent = produto ? formatarMoeda(custoDoItem(item)) : "—";
    tr.querySelector("[data-subtotal]").textContent = produto && Number(item.quantidade) > 0 ? formatarMoeda(subtotalDoItem(item)) : "—";

    // aviso fixo para insumo que deixou de servir; senão o erro de validação (se houver)
    let mensagem = item.erro;
    if (!mensagem && produto && !insumoApto(produto)) {
      mensagem = produto.ativo ? "Este produto não está mais marcado como insumo: remova-o ou troque por outro." : "Este insumo está inativo: remova-o ou troque por outro.";
    }
    const aviso = tr.querySelector(".item-aviso");
    aviso.textContent = mensagem || "";
    aviso.hidden = !mensagem;
    tr.classList.toggle("item-invalido", Boolean(mensagem));
  }

  function reconstruirLinhas() {
    el.corpo.innerHTML = "";
    itens.forEach(item => el.corpo.appendChild(criarLinha(item)));
    sincronizarSelects();
    el.corpo.querySelectorAll("tr[data-uid]").forEach(atualizarLinha);
    atualizarResumo();
  }

  function adicionarLinha({ focar = true } = {}) {
    const item = { uid: proximoUid++, produto_id: "", quantidade: "", erro: "" };
    itens.push(item);
    const tr = criarLinha(item);
    el.corpo.appendChild(tr);
    sincronizarSelects();
    atualizarLinha(tr);
    atualizarResumo();
    aoMudar();
    if (focar) tr.querySelector('[data-campo="produto_id"]').focus();
  }

  el.corpo.addEventListener("input", (evento) => {
    const campo = evento.target.dataset.campo;
    const tr = evento.target.closest("tr[data-uid]");
    if (!campo || !tr) return;
    const item = itemPorUid(tr.dataset.uid);
    item[campo] = evento.target.value;
    item.erro = "";
    evento.target.classList.remove("campo-invalido");
    if (campo === "produto_id") sincronizarSelects();
    atualizarLinha(tr);
    atualizarResumo();
    aoMudar();
  });

  el.corpo.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-remover]");
    if (!botao) return;
    const tr = botao.closest("tr[data-uid]");
    itens = itens.filter(i => i.uid !== Number(tr.dataset.uid));
    tr.remove();
    sincronizarSelects();
    atualizarResumo();
    aoMudar();
  });

  el.adicionar.addEventListener("click", () => adicionarLinha());

  // ---------- Demais campos ----------

  el.produto.addEventListener("change", () => {
    el.grupoProduto.classList.remove("invalido");
    produtoFabricadoId = el.produto.value ? Number(el.produto.value) : null;
    // o fabricado não pode ser insumo: se já estava escolhido numa linha, a linha é limpa
    itens.forEach(i => { if (Number(i.produto_id) === Number(produtoFabricadoId)) i.produto_id = ""; });
    atualizarSiglaRendimento();
    reconstruirLinhas();
    aoMudar();
  });

  el.rendimento.addEventListener("input", () => {
    el.grupoRendimento.classList.remove("invalido");
    atualizarResumo();
    aoMudar();
  });

  el.observacao.addEventListener("input", () => {
    el.contador.textContent = `${el.observacao.value.length}/255`;
    aoMudar();
  });

  // ---------- Validação e payload ----------

  function validar() {
    let primeiroErro = null;
    const registrar = (mensagem, foco) => { if (!primeiroErro) primeiroErro = { mensagem, foco }; };

    if (!editando) {
      el.grupoProduto.classList.toggle("invalido", !el.produto.value);
      if (!el.produto.value) registrar("Selecione o produto fabricado.", el.produto);
    }

    const rendimento = Number(el.rendimento.value);
    let erroRendimento = "";
    if (el.rendimento.value === "" || !(rendimento > 0)) erroRendimento = "Informe um rendimento maior que zero.";
    else if (!casasDecimaisOk(rendimento, 3)) erroRendimento = "O rendimento aceita no máximo 3 casas decimais.";
    el.grupoRendimento.classList.toggle("invalido", Boolean(erroRendimento));
    if (erroRendimento) {
      el.erroRendimento.textContent = erroRendimento;
      registrar(erroRendimento, el.rendimento);
    }

    if (itens.length === 0) registrar("Adicione ao menos um insumo à receita.", el.adicionar);

    itens.forEach(item => {
      const tr = el.corpo.querySelector(`tr[data-uid="${item.uid}"]`);
      const qtd = Number(item.quantidade);
      const produto = produtosPorId[item.produto_id];
      let erro = "";
      let campo = null;

      if (!item.produto_id) { erro = "Selecione o insumo."; campo = "produto_id"; }
      else if (!insumoApto(produto)) { erro = produto && produto.ativo ? "Este produto não está mais marcado como insumo: remova-o ou troque por outro." : "Este insumo está inativo: remova-o ou troque por outro."; campo = "produto_id"; }
      else if (item.quantidade === "" || !(qtd > 0)) { erro = "Informe uma quantidade maior que zero."; campo = "quantidade"; }
      else if (!casasDecimaisOk(qtd, 3)) { erro = "A quantidade aceita no máximo 3 casas decimais."; campo = "quantidade"; }

      item.erro = erro;
      atualizarLinha(tr);
      if (campo) {
        tr.querySelector(`[data-campo="${campo}"]`).classList.add("campo-invalido");
        registrar(erro, tr.querySelector(`[data-campo="${campo}"]`));
      }
    });

    return primeiroErro;
  }

  function montarPayload() {
    const comum = {
      rendimento: Number(el.rendimento.value),
      observacao: el.observacao.value.trim() || null,
      itens: itens.map(i => ({ produto_id: Number(i.produto_id), quantidade: Number(i.quantidade) }))
    };
    return editando ? comum : { produto_id: Number(el.produto.value), ...comum };
  }

  function instantaneo() {
    return JSON.stringify([el.produto.value, el.rendimento.value, el.observacao.value.trim(),
      itens.map(i => [String(i.produto_id), i.quantidade])]);
  }

  // ---------- Preenchimento (editar) ----------

  function preencherDaReceita() {
    el.rendimento.value = String(Number(receita.rendimento));
    el.observacao.value = receita.observacao || "";
    el.contador.textContent = `${el.observacao.value.length}/255`;
    itens = receita.itens.slice().sort((a, b) => a.id - b.id).map(i => ({
      uid: proximoUid++, produto_id: i.produto_id, quantidade: String(Number(i.quantidade)), erro: ""
    }));
    atualizarSiglaRendimento();
    reconstruirLinhas();
  }

  // ---------- Carga inicial ----------

  const pronto = (async () => {
    try {
      const [prods, unidades, receitas] = await Promise.all([
        produtoService.listar({ incluirInativos: true }),
        unidadeMedidaService.listar({ incluirInativos: true }),
        editando ? Promise.resolve([]) : receitaService.listar({ incluirInativos: true })
      ]);
      produtosTodos = prods;
      produtosPorId = Object.fromEntries(prods.map(p => [p.id, p]));
      siglasPorUnidade = Object.fromEntries(unidades.map(u => [u.id, u.sigla]));

      montarProdutoFabricado(new Set(receitas.map(r => r.produto_id)));
      el.adicionar.disabled = false;
      if (editando) {
        preencherDaReceita();
      } else {
        atualizarSiglaRendimento();
        adicionarLinha({ focar: false });
      }
      instantaneoInicial = instantaneo();
    } catch (erro) {
      toast.erro(`Não foi possível carregar os dados do formulário. ${erro.message}`);
      el.produto.innerHTML = '<option value="">Falha ao carregar</option>';
      throw erro;
    }
  })();

  return {
    pronto,
    validar,
    montarPayload,
    alterado: () => instantaneo() !== instantaneoInicial,
    focar: () => { (editando ? el.rendimento : el.produto).focus(); }
  };
}
