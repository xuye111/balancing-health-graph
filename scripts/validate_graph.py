#!/usr/bin/env python3
import json
from pathlib import Path
import sys
from typing import Dict, Iterable, List, Set


VALID_SOURCE_ROLES = {
    "current_standard",
    "current_technical",
    "current_policy",
    "current_service_model",
    "clinical_supplement",
    "policy_context",
    "historical_baseline",
}

REQUIRED_QUESTION_FIELDS = {
    "id",
    "title",
    "description",
    "category",
    "themes",
    "intent",
    "seed_node_ids",
    "target_node_types",
    "allowed_relation_types",
    "max_depth",
    "featured_path_ids",
    "answer_template",
    "boundary_note",
}

REQUIRED_QUESTION_STRING_FIELDS = {
    "id",
    "title",
    "description",
    "category",
    "intent",
    "answer_template",
    "boundary_note",
}

REQUIRED_QUESTION_LIST_FIELDS = {
    "themes",
    "seed_node_ids",
    "target_node_types",
    "allowed_relation_types",
    "featured_path_ids",
}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _duplicate_ids(records: Iterable[dict]) -> Set[str]:
    seen: Set[str] = set()
    duplicates: Set[str] = set()
    for record in records:
        record_id = record.get("id")
        if record_id in seen:
            duplicates.add(record_id)
        seen.add(record_id)
    return duplicates


def _require_list(root: Path, relative_path: str, errors: List[str]):
    try:
        value = load_json(root / relative_path)
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"cannot load {relative_path}: {exc}")
        return []
    if not isinstance(value, list):
        errors.append(f"{relative_path} must contain a JSON array")
        return []
    return value


def validate_project(root: Path) -> List[str]:
    root = Path(root)
    errors: List[str] = []
    try:
        ontology = load_json(root / "ontology/chronic-care-ontology.json")
    except (OSError, json.JSONDecodeError) as exc:
        return [f"cannot load ontology/chronic-care-ontology.json: {exc}"]

    nodes = _require_list(root, "data/nodes.json", errors)
    edges = _require_list(root, "data/edges.json", errors)
    evidence = _require_list(root, "data/evidence.json", errors)
    paths = _require_list(root, "data/paths.json", errors)
    questions = _require_list(root, "data/questions.json", errors)
    sources = _require_list(root, "sources/sources.json", errors)
    if errors:
        return errors

    classes = {item.get("id"): item for item in ontology.get("classes", [])}
    relations = {item.get("id"): item for item in ontology.get("relations", [])}
    valid_themes = set(ontology.get("themes", []))
    valid_statuses = set(ontology.get("review_statuses", []))

    groups = {
        "node": nodes,
        "edge": edges,
        "evidence": evidence,
        "path": paths,
        "question": questions,
        "source": sources,
    }
    for label, records in groups.items():
        for duplicate in sorted(_duplicate_ids(records)):
            errors.append(f"duplicate {label} id: {duplicate}")

    node_by_id: Dict[str, dict] = {item.get("id"): item for item in nodes}
    evidence_ids = {item.get("id") for item in evidence}
    source_ids = {item.get("id") for item in sources}
    edge_ids = {item.get("id") for item in edges}
    path_ids = {item.get("id") for item in paths}

    for node in nodes:
        node_id = node.get("id")
        node_type = node.get("type")
        if node_type not in classes:
            errors.append(f"unknown node type for {node_id}: {node_type}")
        _validate_themes_and_status(node, "node", valid_themes, valid_statuses, errors)
        _validate_evidence_refs(node, "node", evidence_ids, errors)

    for edge in edges:
        edge_id = edge.get("id")
        source = node_by_id.get(edge.get("source"))
        target = node_by_id.get(edge.get("target"))
        relation = relations.get(edge.get("relation"))
        if source is None:
            errors.append(f"dangling source for edge {edge_id}: {edge.get('source')}")
        if target is None:
            errors.append(f"dangling target for edge {edge_id}: {edge.get('target')}")
        if relation is None:
            errors.append(f"unknown relation for edge {edge_id}: {edge.get('relation')}")
        elif source is not None and target is not None:
            if source.get("type") not in relation.get("source_types", []) or target.get("type") not in relation.get("target_types", []):
                errors.append(
                    f"invalid endpoints for edge {edge_id}: "
                    f"{source.get('type')} -[{edge.get('relation')}]-> {target.get('type')}"
                )
        _validate_themes_and_status(edge, "edge", valid_themes, valid_statuses, errors)
        _validate_evidence_refs(edge, "edge", evidence_ids, errors)

    for item in evidence:
        evidence_id = item.get("id")
        if item.get("source_id") not in source_ids:
            errors.append(f"unknown source for evidence {evidence_id}: {item.get('source_id')}")
        if not str(item.get("locator", "")).strip():
            errors.append(f"empty locator for evidence {evidence_id}")
        status = item.get("review_status")
        if status not in valid_statuses:
            errors.append(f"invalid review status for evidence {evidence_id}: {status}")

    for source in sources:
        status = source.get("review_status")
        if status not in valid_statuses:
            errors.append(f"invalid review status for source {source.get('id')}: {status}")
        source_role = source.get("source_role")
        if source_role not in VALID_SOURCE_ROLES:
            errors.append(f"invalid source role for {source.get('id')}: {source_role}")

    for path in paths:
        path_id = path.get("id")
        for node_id in path.get("node_ids", []):
            if node_id not in node_by_id:
                errors.append(f"path {path_id} references unknown node {node_id}")
        for edge_id in path.get("edge_ids", []):
            if edge_id not in edge_ids:
                errors.append(f"path {path_id} references unknown edge {edge_id}")
        invalid_themes = set(path.get("themes", [])) - valid_themes
        if invalid_themes:
            errors.append(f"invalid themes for path {path_id}: {sorted(invalid_themes)}")

    for question in questions:
        _validate_question(
            question,
            set(node_by_id),
            set(classes),
            set(relations),
            path_ids,
            valid_themes,
            errors,
        )

    return errors


def _validate_themes_and_status(record, label, valid_themes, valid_statuses, errors):
    record_id = record.get("id")
    invalid_themes = set(record.get("themes", [])) - valid_themes
    if invalid_themes:
        errors.append(f"invalid themes for {label} {record_id}: {sorted(invalid_themes)}")
    status = record.get("review_status")
    if status not in valid_statuses:
        errors.append(f"invalid review status for {label} {record_id}: {status}")


def _validate_evidence_refs(record, label, evidence_ids, errors):
    record_id = record.get("id")
    for evidence_id in record.get("evidence_refs", []):
        if evidence_id not in evidence_ids:
            errors.append(f"unknown evidence for {label} {record_id}: {evidence_id}")


def _validate_question(
    question, node_ids, class_ids, relation_ids, path_ids, valid_themes, errors
):
    question_id = question.get("id")
    missing = sorted(REQUIRED_QUESTION_FIELDS - question.keys())
    if missing:
        errors.append(f"question {question_id} missing fields: {missing}")
    for field in REQUIRED_QUESTION_STRING_FIELDS:
        if field not in question:
            continue
        if not isinstance(question[field], str):
            errors.append(f"question {question_id} {field} must be a string")
        elif not question[field].strip():
            errors.append(f"question {question_id} {field} must not be empty")
    for field in REQUIRED_QUESTION_LIST_FIELDS:
        if field not in question:
            continue
        if not isinstance(question[field], list):
            errors.append(f"question {question_id} {field} must be a list")
        elif not question[field]:
            errors.append(f"question {question_id} {field} must not be empty")

    list_values = {
        field: question.get(field, []) if isinstance(question.get(field, []), list) else []
        for field in REQUIRED_QUESTION_LIST_FIELDS
    }
    invalid_themes = set(list_values["themes"]) - valid_themes
    if invalid_themes:
        errors.append(f"invalid themes for question {question_id}: {sorted(invalid_themes)}")
    for node_id in list_values["seed_node_ids"]:
        if node_id not in node_ids:
            errors.append(f"question {question_id} references unknown seed node {node_id}")
    for class_id in list_values["target_node_types"]:
        if class_id not in class_ids:
            errors.append(f"question {question_id} references unknown target class {class_id}")
    for relation_id in list_values["allowed_relation_types"]:
        if relation_id not in relation_ids:
            errors.append(f"question {question_id} references unknown relation {relation_id}")
    if question.get("max_depth") not in {1, 2}:
        errors.append(f"question {question_id} max_depth must be 1 or 2")
    for path_id in list_values["featured_path_ids"]:
        if path_id not in path_ids:
            errors.append(f"question {question_id} references unknown featured path {path_id}")
    if "{result_node_labels}" not in question.get("answer_template", ""):
        errors.append(
            f"question {question_id} answer_template must contain {{result_node_labels}}"
        )


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors = validate_project(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    counts = {
        "nodes": len(load_json(root / "data/nodes.json")),
        "edges": len(load_json(root / "data/edges.json")),
        "evidence": len(load_json(root / "data/evidence.json")),
        "sources": len(load_json(root / "sources/sources.json")),
        "paths": len(load_json(root / "data/paths.json")),
        "questions": len(load_json(root / "data/questions.json")),
    }
    print("VALIDATION_OK " + " ".join(f"{key}={value}" for key, value in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
