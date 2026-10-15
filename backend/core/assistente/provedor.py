"""Interface entre o orquestrador e o modelo de linguagem. O orquestrador só conhece estas classes:
trocar o Gemini por outro provedor é escrever outro adaptador, sem mexer na lógica de segurança."""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Tuple, Union


@dataclass(frozen=True)
class Ferramenta:
    nome: str
    descricao: str
    parametros: Dict[str, Any]          # JSON Schema (type=object)


@dataclass
class ChamadaFerramenta:
    nome: str
    args: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Uso:
    entrada: int = 0
    saida: int = 0


@dataclass
class Resposta:
    texto: str = ""
    chamadas: List[ChamadaFerramenta] = field(default_factory=list)
    bruto: Any = None                   # objeto original do provedor (ex.: assinaturas de raciocínio do Gemini), devolvido a ele no passo seguinte
    uso: Uso = field(default_factory=Uso)
    modelo: str = ""                    # modelo que de fato respondeu (pode ser uma reserva)


@dataclass
class TurnoTexto:
    papel: str                          # 'usuario' | 'assistente'
    texto: str


@dataclass
class TurnoChamadas:
    resposta: Resposta                  # o que o modelo pediu (ferramentas)


@dataclass
class TurnoResultados:
    resultados: List[Tuple[ChamadaFerramenta, Dict[str, Any]]]


Turno = Union[TurnoTexto, TurnoChamadas, TurnoResultados]


class ErroProvedor(Exception):
    """Falha do provedor (chave inválida, cota, rede, resposta bloqueada). A mensagem é segura para o usuário."""
    def __init__(self, mensagem: str, temporario: bool = True):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.temporario = temporario
        self.indisponivel = False   # modelo inexistente/sem acesso: vale tentar outro modelo
        self.detalhe: str = ""   # tipo do erro original (sem dados sensíveis), para diagnóstico
        self.logs: list = []   # auditoria parcial, preenchida pelo orquestrador


class Provedor(Protocol):
    def gerar(self, instrucao: str, turnos: List[Turno], ferramentas: List[Ferramenta]) -> Resposta: ...


class ProvedorFalso:
    """Para testes: devolve respostas de um roteiro (lista de Resposta ou funções turnos->Resposta) e guarda o que recebeu."""
    def __init__(self, roteiro: List[Any]):
        self.roteiro = list(roteiro)
        self.recebido: List[Dict[str, Any]] = []

    def gerar(self, instrucao, turnos, ferramentas):
        self.recebido.append({"instrucao": instrucao, "turnos": list(turnos), "ferramentas": [f.nome for f in ferramentas]})
        if not self.roteiro:
            raise AssertionError("o roteiro do provedor falso acabou")
        item = self.roteiro.pop(0)
        if isinstance(item, Exception):
            raise item
        return item(turnos) if callable(item) else item
