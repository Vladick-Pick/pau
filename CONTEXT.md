# ПАУ

ПАУ is the Program of Active Participants: an operational layer for selecting, preparing, and tracking club members who can strengthen meetings and other club formats.

## Language

**Клубный профиль**:
The source profile of a club member, including membership, business, activity, attendance, and retention facts. ПАУ consumes it as evidence, not as the canonical owner of those facts.
_Avoid_: ПАУ-профиль when referring to source club data

**Активный участник ПАУ**:
A club member inferred as suitable to represent or strengthen ПАУ formats based on the club profile's quality signals. The status should be explainable through underlying facts rather than entered as a bare manual label.
_Avoid_: Просто участник, member

**Формат ПАУ**:
A repeatable participation context such as a guest meeting, working group, expert dialogue, or forum role. A format defines what kind of active participant is relevant for that situation.
_Avoid_: Тип мероприятия when discussing ПАУ-specific selection logic

**Расчетный retention**:
A materialized profile fact that estimates whether a member is likely to stay with the club. ПАУ should read this from the club profile rather than recompute it from raw payments or lifecycle events.
_Avoid_: Payment count, renewal guess

**Доходимость**:
A materialized profile fact describing whether a person actually attends meetings after being expected or invited. It is distinct from raw attendance count because it measures reliability, not volume.
_Avoid_: Посещаемость

**Клубная активность**:
Contribution to club infrastructure or leadership, such as being an ambassador, subclub leader, or visible active contributor. It is not the same as attending events or forums.
_Avoid_: Посещения, форумы

**Готовность к формату**:
The current suitability or willingness of an active participant to join a specific ПАУ format. One active participant can have different readiness values for different formats.
_Avoid_: Общий статус активного

**История участия**:
The factual record of where and how an active participant took part in ПАУ formats. It answers what happened, not why the person was selected.
_Avoid_: Matching history

**История мэтчинга**:
The record of selection decisions for an active participant in relation to a concrete format or meeting: matched, invited and attended, invited and did not attend, or not invited with a comment.
_Avoid_: Participation history

## Flagged Ambiguities

**Клубная активность vs. доходимость**:
Resolved as separate facts. Доходимость is reliability of attendance; клубная активность is contribution or leadership inside the club.

**Retention source**:
Resolved as a club profile fact. ПАУ may display and use retention, but should not own the core retention calculation.

## Example Dialogue

Manager: "Можно позвать этого человека на гостевую встречу как активного участника?"

Domain expert: "Смотри на готовность к формату. Он может быть активным участником ПАУ в целом, но для гостевой встречи нам нужны хороший расчетный retention, высокая доходимость, подходящий масштаб бизнеса и клубная активность."

Manager: "У него много посещений форумов, этого достаточно?"

Domain expert: "Нет. Посещения помогают понять историю участия, но клубная активность означает вклад: амбассадор, лидер подклуба или заметная роль в клубе."
