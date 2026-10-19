// Nova Receita. Toda a regra do formulário está em components/receita-form.js (a mesma usada ao editar).

document.addEventListener("DOMContentLoaded", async () => {
  if (!exigirPermissao("producao.editar")) return;

  const el = {
    form: document.getElementById("form-receita"),
    botaoSalvar: document.getElementById("botao-salvar"),
    botaoCancelar: document.getElementById("botao-cancelar"),
    linkVoltar: document.getElementById("link-voltar")
  };

  let salvando = false;
  let saindo = false;

  const formulario = criarFormularioReceita(document.getElementById("receita-form"), { modo: "criar" });
  try {
    await formulario.pronto;
    el.botaoSalvar.disabled = false;
  } catch (erro) {
    return;   // o formulário já avisou o erro de carga
  }

  async function salvar() {
    if (salvando) return;
    const problema = formulario.validar();
    if (problema) {
      toast.erro(problema.mensagem);
      if (problema.foco && problema.foco.focus) problema.foco.focus();
      return;
    }

    salvando = true;
    el.botaoSalvar.disabled = true;
    el.botaoSalvar.textContent = "Salvando...";
    try {
      const criada = await receitaService.criar(formulario.montarPayload());
      saindo = true;
      window.location.href = `receita-detalhe.html?id=${criada.id}&novo=1`;
    } catch (erro) {
      toast.erro(erro.message);
      salvando = false;
      el.botaoSalvar.disabled = false;
      el.botaoSalvar.textContent = "Salvar Receita";
    }
  }

  async function sair(evento) {
    if (evento) evento.preventDefault();
    if (formulario.alterado()) {
      const descartar = await confirmarAcao({
        titulo: "Descartar esta receita?",
        mensagem: "Os dados preenchidos ainda não foram salvos e serão perdidos.",
        textoConfirmar: "Descartar",
        textoCancelar: "Continuar editando",
        perigo: true
      });
      if (!descartar) return;
    }
    saindo = true;
    window.location.href = "producao.html?aba=receitas";
  }

  el.form.addEventListener("submit", (e) => e.preventDefault());
  el.botaoSalvar.addEventListener("click", salvar);
  el.botaoCancelar.addEventListener("click", sair);
  el.linkVoltar.addEventListener("click", sair);

  window.addEventListener("beforeunload", (evento) => {
    if (!saindo && !salvando && formulario.alterado()) {
      evento.preventDefault();
      evento.returnValue = "";
    }
  });
});
