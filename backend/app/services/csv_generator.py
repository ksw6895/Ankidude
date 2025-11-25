import csv
import io
from typing import Iterable, Union

from app.schemas.card import Card


def _normalize(card: Union[Card, dict]) -> Card:
    if isinstance(card, Card):
        return card
    return Card.model_validate(card)


def _clean_value(value: str) -> str:
    return value.replace("\n", " / ").strip()


def render_csv(cards: Iterable[Union[Card, dict]]) -> str:
    buffer = io.StringIO()
    meta_lines = [
        "#separator:Semicolon",
        "#columns:Front;Back;Tags",
        "#html:false",
    ]
    buffer.write("\n".join(meta_lines))
    buffer.write("\n")

    writer = csv.writer(buffer, delimiter=";")
    for card_raw in cards:
        card = _normalize(card_raw)
        writer.writerow(
            [
                _clean_value(card.front),
                _clean_value(card.back),
                _clean_value(card.tag or ""),
            ]
        )

    return buffer.getvalue()
