//! Конвертация между "произвольным JSON" (то, чем оперирует фронтенд и чем
//! был settings/payment_info в старом REST-API) и protobuf-типами
//! `google.protobuf.Struct`/`Value`/`Timestamp`, которые за них теперь
//! отвечают в новом API (см. api_migration_map.md — "Произвольный JSON
//! (settings, payment_info) → google.protobuf.Struct", "Даты: ISO-строки →
//! google.protobuf.Timestamp").

use prost_types::value::Kind;
use prost_types::{ListValue, Struct as PStruct, Timestamp, Value as PValue};
use serde_json::{Map, Value as JValue};
use std::collections::BTreeMap;

pub fn json_to_struct(v: &JValue) -> PStruct {
    let mut fields = BTreeMap::new();
    if let JValue::Object(map) = v {
        for (k, val) in map {
            fields.insert(k.clone(), json_to_pvalue(val));
        }
    }
    PStruct { fields }
}

fn json_to_pvalue(v: &JValue) -> PValue {
    let kind = match v {
        JValue::Null => Kind::NullValue(0),
        JValue::Bool(b) => Kind::BoolValue(*b),
        JValue::Number(n) => Kind::NumberValue(n.as_f64().unwrap_or(0.0)),
        JValue::String(s) => Kind::StringValue(s.clone()),
        JValue::Array(arr) => Kind::ListValue(ListValue {
            values: arr.iter().map(json_to_pvalue).collect(),
        }),
        JValue::Object(_) => Kind::StructValue(json_to_struct(v)),
    };
    PValue { kind: Some(kind) }
}

pub fn struct_to_json(s: &PStruct) -> JValue {
    let mut map = Map::new();
    for (k, v) in &s.fields {
        map.insert(k.clone(), pvalue_to_json(v));
    }
    JValue::Object(map)
}

fn pvalue_to_json(v: &PValue) -> JValue {
    match &v.kind {
        None | Some(Kind::NullValue(_)) => JValue::Null,
        Some(Kind::BoolValue(b)) => JValue::Bool(*b),
        Some(Kind::NumberValue(n)) => {
            serde_json::Number::from_f64(*n).map(JValue::Number).unwrap_or(JValue::Null)
        }
        Some(Kind::StringValue(s)) => JValue::String(s.clone()),
        Some(Kind::ListValue(l)) => JValue::Array(l.values.iter().map(pvalue_to_json).collect()),
        Some(Kind::StructValue(st)) => struct_to_json(st),
    }
}

/// `google.protobuf.Timestamp` → строка ISO 8601/RFC 3339 — формат, который
/// раньше отдавал старый REST-бэкенд напрямую как JSON-строку, и который
/// фронтенд уже умеет показывать как есть (нигде на фронте нет парсинга
/// формата, только прямой вывод — см. normalizeQuestion/normalizeChapter в
/// api.js, там created_at просто прокидывается дальше).
pub fn ts_to_iso(ts: &Timestamp) -> String {
    chrono::DateTime::from_timestamp(ts.seconds, ts.nanos.max(0) as u32)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

pub fn opt_ts_to_iso(ts: &Option<Timestamp>) -> Option<String> {
    ts.as_ref().map(ts_to_iso)
}
