//! settings / payment_info хранятся в БД как JSONB и по проводу ходят как
//! google.protobuf.Struct (см. .proto). Здесь — конвертация между
//! serde_json::Value (то, с чем работает остальной код и БД через sqlx::Json)
//! и prost_types::Struct (то, что генерирует/принимает gRPC).

use prost_types::value::Kind;
use prost_types::{ListValue, Struct, Value as PbValue};
use serde_json::{Map, Value as JsonValue};

pub fn json_to_struct(value: &JsonValue) -> Struct {
    match value {
        JsonValue::Object(map) => json_map_to_struct(map),
        // На верхнем уровне settings/payment_info всегда объект (validate_safe_json
        // это гарантирует), но если вдруг нет — не падаем, отдаём пустой Struct.
        _ => Struct::default(),
    }
}

fn json_map_to_struct(map: &Map<String, JsonValue>) -> Struct {
    Struct {
        fields: map
            .iter()
            .map(|(k, v)| (k.clone(), json_to_pbvalue(v)))
            .collect(),
    }
}

fn json_to_pbvalue(value: &JsonValue) -> PbValue {
    let kind = match value {
        JsonValue::Null => Kind::NullValue(0),
        JsonValue::Bool(b) => Kind::BoolValue(*b),
        JsonValue::Number(n) => Kind::NumberValue(n.as_f64().unwrap_or(0.0)),
        JsonValue::String(s) => Kind::StringValue(s.clone()),
        JsonValue::Array(items) => Kind::ListValue(ListValue {
            values: items.iter().map(json_to_pbvalue).collect(),
        }),
        JsonValue::Object(map) => Kind::StructValue(json_map_to_struct(map)),
    };
    PbValue { kind: Some(kind) }
}

pub fn struct_to_json(s: &Struct) -> JsonValue {
    JsonValue::Object(
        s.fields
            .iter()
            .map(|(k, v)| (k.clone(), pbvalue_to_json(v)))
            .collect(),
    )
}

fn pbvalue_to_json(value: &PbValue) -> JsonValue {
    match &value.kind {
        None | Some(Kind::NullValue(_)) => JsonValue::Null,
        Some(Kind::BoolValue(b)) => JsonValue::Bool(*b),
        Some(Kind::NumberValue(n)) => number_to_json(*n),
        Some(Kind::StringValue(s)) => JsonValue::String(s.clone()),
        Some(Kind::ListValue(list)) => {
            JsonValue::Array(list.values.iter().map(pbvalue_to_json).collect())
        }
        Some(Kind::StructValue(s)) => struct_to_json(s),
    }
}

/// google.protobuf.Struct умеет хранить числа только как double (NumberValue
/// — всегда f64), в отличие от JSON, где 15 и 15.0 — разные представления.
/// Без этой поправки "answered": 15 в settings уходило бы по проводу и
/// приходило обратно как 15.0, а serde_json::Number::as_i64() на float-typed
/// числе возвращает None даже если значение целое — молча ломая любой код,
/// сравнивающий/суммирующий такие значения как i64 (см. friendship_service::points_of).
/// Поэтому целые в диапазоне i64 после round-trip восстанавливаются как
/// целые JSON-числа.
fn number_to_json(n: f64) -> JsonValue {
    if n.fract() == 0.0 && n.is_finite() && n >= i64::MIN as f64 && n <= i64::MAX as f64 {
        JsonValue::Number((n as i64).into())
    } else {
        serde_json::Number::from_f64(n)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Регрессия для бага №3 из CHECKLIST.md: google.protobuf.Struct хранит
    /// числа только как f64, из-за чего "answered": 15 (int) уходило по
    /// проводу и возвращалось как 15.0 — Leaderboard молча считал 0 очков.
    /// Круг: JSON -> Struct -> JSON должен восстанавливать целые числа как
    /// целые (as_i64() обязан быть Some), а не только "выглядят одинаково".
    #[test]
    fn integer_survives_struct_round_trip() {
        let original = json!({
            "quiz_stats": {
                "chapter2": { "answered": 15, "total": 30 }
            }
        });

        let round_tripped = struct_to_json(&json_to_struct(&original));

        let answered = round_tripped["quiz_stats"]["chapter2"]["answered"].clone();
        assert!(
            answered.as_i64() == Some(15),
            "expected integer 15 to survive the round trip as_i64(), got {answered:?}"
        );
    }

    /// Отрицательные и большие (но в пределах i64) целые — та же гарантия.
    #[test]
    fn negative_and_large_integers_survive_round_trip() {
        let original = json!({ "a": -42, "b": 9_007_199_254_740_993i64 });
        let round_tripped = struct_to_json(&json_to_struct(&original));
        assert_eq!(round_tripped["a"].as_i64(), Some(-42));
        assert_eq!(round_tripped["b"].as_i64(), Some(9_007_199_254_740_993));
    }

    /// Настоящие дробные значения не должны внезапно становиться целыми.
    #[test]
    fn genuine_fractions_stay_fractional() {
        let original = json!({ "ratio": 0.5 });
        let round_tripped = struct_to_json(&json_to_struct(&original));
        assert_eq!(round_tripped["ratio"].as_f64(), Some(0.5));
        assert_eq!(round_tripped["ratio"].as_i64(), None);
    }
}
