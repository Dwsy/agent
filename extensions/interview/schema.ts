export interface Question {
	id: string;
	type: "single" | "multi" | "text" | "image";
	question: string;
	options?: string[];
	recommended?: string | string[];
	context?: string;
}

export interface QuestionsFile {
	title?: string;
	description?: string;
	questions: Question[];
	voice?: VoiceConfig;
}

export interface VoiceConfig {
	greeting?: string;
	closing?: string;
}

const SCHEMA_EXAMPLE = `Expected format:
{
  "title": "Optional Title",
  "questions": [
    { "id": "q1", "type": "single", "question": "Pick one?", "options": ["A", "B"] },
    { "id": "q2", "type": "multi", "question": "Pick many?", "options": ["X", "Y", "Z"] },
    { "id": "q3", "type": "text", "question": "Describe?" },
    { "id": "q4", "type": "image", "question": "Upload?" }
  ]
}
Valid types: single, multi, text, image
Options: required for single/multi, must be array of STRINGS (not objects)`;

function validateBasicStructure(data: unknown): QuestionsFile {
	// Check if data is an array (common mistake - should be object with questions property)
	if (Array.isArray(data)) {
		throw new Error(
			`Invalid questions file: root must be an object, not an array.\n\n${SCHEMA_EXAMPLE}`
		);
	}

	if (!data || typeof data !== "object") {
		throw new Error(`Invalid questions file: must be an object.\n\n${SCHEMA_EXAMPLE}`);
	}
	
	const obj = data as Record<string, unknown>;

	// Detect common wrong field names at root level
	if ("label" in obj || "description" in obj && !("questions" in obj)) {
		throw new Error(
			`Invalid questions file: missing "questions" array. Did you mean to wrap your questions?\n\n${SCHEMA_EXAMPLE}`
		);
	}
	
	if (obj.title !== undefined && typeof obj.title !== "string") {
		throw new Error("Invalid questions file: title must be a string");
	}
	
	if (obj.description !== undefined && typeof obj.description !== "string") {
		throw new Error("Invalid questions file: description must be a string");
	}

	if (obj.voice !== undefined) {
		if (!obj.voice || typeof obj.voice !== "object") {
			throw new Error("Invalid questions file: voice must be an object");
		}
		const voice = obj.voice as Record<string, unknown>;
		if (voice.greeting !== undefined && typeof voice.greeting !== "string") {
			throw new Error("Invalid questions file: voice.greeting must be a string");
		}
		if (voice.closing !== undefined && typeof voice.closing !== "string") {
			throw new Error("Invalid questions file: voice.closing must be a string");
		}
	}
	
	if (!Array.isArray(obj.questions) || obj.questions.length === 0) {
		throw new Error(
			`Invalid questions file: "questions" must be a non-empty array.\n\n${SCHEMA_EXAMPLE}`
		);
	}
	
	const validTypes = ["single", "multi", "text", "image"];
	for (let i = 0; i < obj.questions.length; i++) {
		const q = obj.questions[i] as Record<string, unknown>;
		if (!q || typeof q !== "object") {
			throw new Error(`Invalid question at index ${i}: must be an object`);
		}
		if (typeof q.id !== "string") {
			throw new Error(`Invalid question at index ${i}: id must be a string`);
		}

		// Detect wrong type values
		if (typeof q.type !== "string" || !validTypes.includes(q.type)) {
			const hint = q.type === "select" ? ' (use "single" instead of "select")' : "";
			throw new Error(
				`Question "${q.id}": type must be one of: ${validTypes.join(", ")}${hint}`
			);
		}

		// Detect wrong field names for question text
		if (typeof q.question !== "string") {
			const hint = "label" in q || "description" in q 
				? ' (use "question" field, not "label" or "description")'
				: "";
			throw new Error(`Question "${q.id}": "question" field must be a string${hint}`);
		}

		if (q.options !== undefined) {
			if (!Array.isArray(q.options) || q.options.length === 0) {
				throw new Error(`Question "${q.id}": options must be a non-empty array of strings`);
			}
			// Detect object options (common mistake from other form libraries)
			if (q.options.some((o: unknown) => typeof o === "object" && o !== null)) {
				throw new Error(
					`Question "${q.id}": options must be strings, not objects. Use ["Option A", "Option B"] instead of [{value, label}]`
				);
			}
			if (q.options.some((o: unknown) => typeof o !== "string")) {
				throw new Error(`Question "${q.id}": options must be a non-empty array of strings`);
			}
		}
		if (q.context !== undefined && typeof q.context !== "string") {
			throw new Error(`Question "${q.id}": context must be a string`);
		}
	}
	
	return obj as unknown as QuestionsFile;
}

export function validateQuestions(data: unknown): QuestionsFile {
	const parsed = validateBasicStructure(data);

	const ids = new Set<string>();
	for (const q of parsed.questions) {
		if (ids.has(q.id)) {
			throw new Error(`Duplicate question id: "${q.id}"`);
		}
		ids.add(q.id);
	}

	for (const q of parsed.questions) {
		if (q.type === "single" || q.type === "multi") {
			if (!q.options || q.options.length === 0) {
				throw new Error(`Question "${q.id}": options required for type "${q.type}"`);
			}
		} else if (q.type === "text" || q.type === "image") {
			if (q.options) {
				throw new Error(`Question "${q.id}": options not allowed for type "${q.type}"`);
			}
		}

		if (q.recommended !== undefined) {
			if (q.type === "text" || q.type === "image") {
				throw new Error(`Question "${q.id}": recommended not allowed for type "${q.type}"`);
			}

			if (q.type === "single") {
				if (typeof q.recommended !== "string") {
					throw new Error(`Question "${q.id}": recommended must be string for single-select`);
				}
				if (!q.options?.includes(q.recommended)) {
					throw new Error(
						`Question "${q.id}": recommended "${q.recommended}" not in options`
					);
				}
			}

			if (q.type === "multi") {
				const recs = Array.isArray(q.recommended) ? q.recommended : [q.recommended];
				for (const rec of recs) {
					if (!q.options?.includes(rec)) {
						throw new Error(`Question "${q.id}": recommended "${rec}" not in options`);
					}
				}
				if (!Array.isArray(q.recommended)) {
					q.recommended = recs;
				}
			}
		}
	}

	return parsed;
}
