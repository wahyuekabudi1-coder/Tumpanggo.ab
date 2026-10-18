/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Typed error for Firestore Database availability failures.
 * Encapsulates safe diagnostics and remediation steps without exposing credentials.
 */

import type { DiagnosticReason } from '../firebaseAdmin';

export class DatabaseUnavailableError extends Error {
  public readonly code = 'DATABASE_UNAVAILABLE';
  public readonly diagnosticReason: DiagnosticReason;
  public readonly diagnosticDetail: string;
  public readonly remediationStep?: string;
  public readonly authIdentity: string;
  public readonly projectId: string;
  public readonly databaseId: string;

  constructor(
    diagnosticReason: DiagnosticReason,
    diagnosticDetail: string,
    remediationStep?: string,
    authIdentity = 'No Service Account Configured',
    projectId = 'tumpanggo-70479',
    databaseId = '(default)'
  ) {
    super(diagnosticDetail);
    this.name = 'DatabaseUnavailableError';
    this.diagnosticReason = diagnosticReason;
    this.diagnosticDetail = diagnosticDetail;
    this.remediationStep = remediationStep;
    this.authIdentity = authIdentity;
    this.projectId = projectId;
    this.databaseId = databaseId;

    Object.setPrototypeOf(this, DatabaseUnavailableError.prototype);
  }
}
