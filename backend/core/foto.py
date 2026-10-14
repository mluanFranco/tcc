"""Foto do usuário: validação pelo conteúdo, recorte quadrado 256x256, regravação em JPEG (descarta EXIF/GPS) e disco.

Os arquivos ficam em <backend>/uploads/usuarios/ (ou em UPLOADS_DIR/usuarios). O banco guarda só o nome do arquivo.
"""
import io
import os
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

TAMANHO_MAXIMO = 2 * 1024 * 1024        # bytes enviados
LADO = 256                              # px, foto final quadrada
PIXELS_MAXIMOS = 25_000_000             # protege a memória contra imagens gigantes
FORMATOS_ACEITOS = {"JPEG", "PNG", "WEBP"}
_NOME_VALIDO = re.compile(r"^[0-9]+-[0-9a-f]{12}\.jpg$")


def pasta() -> Path:
    base = os.getenv("UPLOADS_DIR") or str(Path(__file__).resolve().parent.parent / "uploads")
    p = Path(base) / "usuarios"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _invalida(msg="O arquivo enviado não é uma imagem válida (use JPEG, PNG ou WebP)"):
    raise HTTPException(status_code=400, detail=msg)


def processar(conteudo: bytes) -> bytes:
    """Valida e devolve a foto final em JPEG."""
    if not conteudo:
        _invalida("Nenhum arquivo foi enviado")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise HTTPException(status_code=400, detail=f"A imagem excede o limite de {TAMANHO_MAXIMO // (1024 * 1024)} MB")
    try:
        img = Image.open(io.BytesIO(conteudo))
        if img.format not in FORMATOS_ACEITOS:
            _invalida()
        if img.width * img.height > PIXELS_MAXIMOS:
            _invalida("A imagem tem dimensões grandes demais")
        img.load()
        img = ImageOps.exif_transpose(img)           # respeita a orientação da câmera antes de descartar o EXIF
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            fundo = Image.new("RGB", img.size, (255, 255, 255))
            fundo.paste(img, mask=img.getchannel("A"))
            img = fundo
        else:
            img = img.convert("RGB")
        img = ImageOps.fit(img, (LADO, LADO), method=Image.LANCZOS)   # recorte central quadrado
        saida = io.BytesIO()
        img.save(saida, format="JPEG", quality=85, optimize=True)     # sem exif=: nenhum metadado é mantido
        return saida.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError, EOFError):
        _invalida()


def salvar(usuario_id: int, jpeg: bytes) -> str:
    nome = f"{usuario_id}-{uuid.uuid4().hex[:12]}.jpg"
    (pasta() / nome).write_bytes(jpeg)
    return nome


def caminho(nome: Optional[str]) -> Optional[Path]:
    """Caminho do arquivo, só para nomes gerados por este módulo (nada de ../ vindo de fora)."""
    if not nome or not _NOME_VALIDO.match(nome):
        return None
    p = pasta() / nome
    return p if p.is_file() else None


def remover(nome: Optional[str]) -> None:
    p = caminho(nome)
    if p:
        try:
            p.unlink()
        except OSError:
            pass   # arquivo órfão não é motivo para falhar a operação
