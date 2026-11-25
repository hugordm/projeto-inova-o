"use client";
// "use client": a página tem estado (texto digitado, resultado), então roda no navegador.

import { useEffect, useState } from "react";
import { EXEMPLOS } from "@/lib/exemplos";
import type { Status, Tipo } from "@/lib/tipos";
import {
  camposDeModeloAbertos,
  contarRespondidos,
  inserirModelo,
  pedeDecisao,
  type Decisao,
} from "@/lib/revisaoHumana";

const MAX_TEXTO = 3000;

type ItemResultado = {
  item: { id: string; titulo: string; pergunta: string; fonte: string; modelo: string };
  status: Status;
  evidencia: string | null;
};

// Texto do selo e explicação de cada status, num lugar só.
const INFO_STATUS: Record<Status, { rotulo: string; explicacao: string }> = {
  respondido: { rotulo: "Respondido", explicacao: "a descrição responde essa pergunta." },
  ambiguo: {
    rotulo: "Ambíguo",
    explicacao: "o assunto aparece, mas a frase não responde por completo.",
  },
  ausente: { rotulo: "Ausente", explicacao: "nada no texto responde; o comprador vai perguntar." },
  nao_confirmado: {
    rotulo: "Não confirmado",
    explicacao: "a citação não existe no texto, o código descartou.",
  },
};

type Modo = "ia" | "sem-ia" | "fallback-sem-ia";

// Como cada modo aparece na tela.
const ROTULO_MODO: Record<Modo, string> = {
  ia: "Analisado por IA",
  "sem-ia": "Análise por palavras-chave",
  "fallback-sem-ia": "Análise por palavras-chave (a IA falhou)",
};

const NOMES_TIPO: Record<Tipo, string> = {
  digital: "Produto digital",
  fisico: "Produto físico",
  assinatura: "Assinatura",
};

export default function Pagina() {
  const [tipo, setTipo] = useState<Tipo>("digital");
  const [texto, setTexto] = useState("");
  const [simular, setSimular] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ItemResultado[] | null>(null);
  // null = ainda perguntando ao servidor se a IA está configurada.
  const [iaDisponivel, setIaDisponivel] = useState<boolean | null>(null);
  const [usarIA, setUsarIA] = useState(false);
  const [modo, setModo] = useState<Modo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Decisões da pessoa por id do item. Ficam só na tela: não vão para a API.
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});

  // Ao abrir a página, pergunta ao servidor se há IA; se houver, marca "Usar IA".
  useEffect(() => {
    fetch("/api/revisar")
      .then((r) => r.json())
      .then((d) => {
        setIaDisponivel(d.iaDisponivel === true);
        setUsarIA(d.iaDisponivel === true);
      })
      .catch(() => setIaDisponivel(false));
  }, []);

  function preencher(t: Tipo) {
    setTipo(t);
    setTexto(EXEMPLOS[t]);
    setResultado(null);
    setErro(null);
    setModo(null);
    setAviso(null);
    setDecisoes({});
  }

  // Acrescenta a frase-modelo ao fim da caixa de texto, sem passar do limite.
  function inserir(modelo: string) {
    const novo = inserirModelo(texto, modelo);
    if (novo.length > MAX_TEXTO) {
      setErro(`Não cabe: o texto passaria de ${MAX_TEXTO} caracteres.`);
      return;
    }
    setErro(null);
    setTexto(novo);
  }

  // Registra (ou desfaz, com null) a decisão humana de um item.
  function decidir(id: string, decisao: Decisao | null) {
    setDecisoes((atual) => {
      const copia = { ...atual };
      if (decisao) copia[id] = decisao;
      else delete copia[id];
      return copia;
    });
  }

  async function revisar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/revisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          texto,
          simularInvencao: simular,
          modo: usarIA ? "ia" : "sem-ia",
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) {
        setResultado(null);
        setModo(null);
        setAviso(null);
        setErro(dados.erro ?? "Erro ao revisar.");
        return;
      }
      setResultado(dados.resultado);
      setDecisoes({}); // resultado novo: decisões antigas não valem mais
      setModo(dados.modo ?? null);
      setAviso(dados.aviso ?? null);
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setCarregando(false);
    }
  }

  // Conta pelo status da máquina, trocado pela decisão humana quando houver.
  const respondidos = resultado
    ? contarRespondidos(resultado.map((r) => ({ id: r.item.id, status: r.status })), decisoes)
    : 0;
  // Só campos vindos das frases-modelo bloqueiam; "[2026]" escrito pelo vendedor, não.
  const abertos = camposDeModeloAbertos(texto);
  const bloqueado = abertos.length > 0;

  return (
    <>
      <div className="faixa">Passo 2: análise com IA (ou por palavras-chave). Dados e regras de exemplo.</div>

      <main className="container">
        <header>
          <h1>Antes que Perguntem</h1>
          <p className="subtitulo">
            Cole a descrição do produto e veja o que o comprador vai precisar perguntar.
          </p>
        </header>

        <section className="cartao">
          <div className="exemplos">
            <span>Exemplos:</span>
            {(Object.keys(EXEMPLOS) as Tipo[]).map((t) => (
              <button key={t} type="button" className="botao-secundario" onClick={() => preencher(t)}>
                {NOMES_TIPO[t]}
              </button>
            ))}
          </div>

          <label htmlFor="tipo">Tipo de produto</label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            {(Object.keys(NOMES_TIPO) as Tipo[]).map((t) => (
              <option key={t} value={t}>
                {NOMES_TIPO[t]}
              </option>
            ))}
          </select>

          <label htmlFor="texto">Descrição do produto</label>
          <textarea
            id="texto"
            rows={7}
            value={texto}
            maxLength={MAX_TEXTO}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Cole aqui a descrição (20 a 3000 caracteres)"
          />
          <div className="contador">
            {texto.length}/{MAX_TEXTO}
          </div>
          {bloqueado && (
            <p className="aviso">
              Há campos entre colchetes sem preencher. Faltam: {abertos.join(", ")}
            </p>
          )}

          <label className="checkbox">
            <input
              type="checkbox"
              checked={usarIA}
              disabled={!iaDisponivel}
              onChange={(e) => setUsarIA(e.target.checked)}
            />
            Usar IA
            {iaDisponivel === false && " (indisponível: IA não configurada no servidor)"}
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={simular} onChange={(e) => setSimular(e.target.checked)} />
            Simular erro da IA (inventar citação)
          </label>

          {/* Bloqueado enquanto houver campo de frase-modelo sem preencher (o aviso acima explica). */}
          <button
            type="button"
            className="botao-principal"
            onClick={revisar}
            disabled={carregando || bloqueado}
            title={bloqueado ? "Preencha os campos entre colchetes para revisar" : undefined}
          >
            {carregando ? "Revisando..." : "Revisar"}
          </button>

          {erro && <p className="erro">{erro}</p>}
        </section>

        {resultado && (
          <section>
            {modo && <p className={`modo modo-${modo}`}>{ROTULO_MODO[modo]}</p>}
            {aviso && <p className="aviso">{aviso}</p>}
            <h2 className="resumo">
              {respondidos} de {resultado.length} itens respondidos
            </h2>
            <ul className="lista">
              {resultado.map((r) => {
                const decisao = pedeDecisao(r.status) ? decisoes[r.item.id] : undefined;
                return (
                <li key={r.item.id} className={`item item-${r.status}`}>
                  <div className="item-topo">
                    <strong>{r.item.titulo}</strong>
                    <span className="selos">
                      {/* O selo da máquina continua visível; a decisão humana vem ao lado. */}
                      <span className={`selo selo-${r.status}`}>{INFO_STATUS[r.status].rotulo}</span>
                      {decisao && (
                        <span className="selo selo-humano">
                          {decisao === "respondido" ? "Respondido" : "Faltando"}: decidido por revisão humana
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="pergunta">“{r.item.pergunta}”</p>
                  <p className="explicacao">
                    {INFO_STATUS[r.status].rotulo}: {INFO_STATUS[r.status].explicacao}
                  </p>
                  {r.evidencia && (
                    <blockquote className={r.status === "nao_confirmado" ? "riscada" : ""}>
                      {r.evidencia}
                    </blockquote>
                  )}

                  {r.status === "ausente" && (
                    <div className="modelo">
                      <span className="modelo-rotulo">Sugestão de frase (complete os colchetes):</span>
                      <code>{r.item.modelo}</code>
                      <button
                        type="button"
                        className="botao-secundario"
                        onClick={() => inserir(r.item.modelo)}
                      >
                        Inserir no texto
                      </button>
                    </div>
                  )}

                  {pedeDecisao(r.status) && (
                    <div className="decisao">
                      {decisao ? (
                        <button type="button" className="botao-link" onClick={() => decidir(r.item.id, null)}>
                          Desfazer decisão
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="botao-secundario"
                            onClick={() => decidir(r.item.id, "respondido")}
                          >
                            Marcar como respondido
                          </button>
                          <button
                            type="button"
                            className="botao-secundario"
                            onClick={() => decidir(r.item.id, "faltando")}
                          >
                            Manter como faltando
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <p className="fonte">Fonte: {r.item.fonte}</p>
                </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
