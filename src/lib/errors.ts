// API のエラーを、項目ごとのエラーとフォーム全体のエラーに分ける。
import { ApiError } from "@/api";

export interface FormErrors {
  /** 項目名 → 表示するメッセージ */
  fields: Record<string, string>;
  /** 項目に結び付かないエラー（フォームの上に表示する） */
  form: string;
}

/** 入力チェックのエラーのとき、項目ごとに表示する分かりやすいメッセージ（画面ごとに上書きできる） */
const FIELD_LABELS: Record<string, string> = {
  email: "メールアドレスの形式が正しくありません",
  password: "パスワードは8〜128文字で入力してください",
  new_password: "パスワードは8〜128文字で入力してください",
  initial_password: "パスワードは8〜128文字で入力してください",
  organization_name: "組織名は1〜100文字で入力してください",
  name: "1〜50文字で入力してください",
  birth_date: "生年月日を入力してください",
  position_name: "50文字以内で入力してください",
  job_type_name: "50文字以内で入力してください",
};

export const noErrors = (): FormErrors => ({ fields: {}, form: "" });

/**
 * @param fieldNames 画面にある項目の名前。ここにない項目のエラーは、フォーム全体のエラーとして表示する
 * @param labels 項目ごとのメッセージの上書き
 */
export function toFormErrors(
  err: unknown,
  fieldNames: string[] = [],
  labels: Record<string, string> = {},
): FormErrors {
  if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.errors.length) {
    const fields: Record<string, string> = {};
    let unknownField = false;
    for (const { field } of err.errors) {
      if (fieldNames.includes(field)) {
        fields[field] = labels[field] ?? FIELD_LABELS[field] ?? "入力内容を確認してください";
      } else {
        unknownField = true;
      }
    }
    return { fields, form: unknownField ? err.message : "" };
  }
  return {
    fields: {},
    form: err instanceof ApiError ? err.message : "通信に失敗しました。時間をおいて再度お試しください",
  };
}
