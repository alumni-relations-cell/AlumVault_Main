# Complete RBAC Matrix

| Feature Domain      | `super_admin` | `admin`       | `team_lead`   | `team_member` |
|---------------------|---------------|---------------|---------------|---------------|
| **Alumni: Read**    | Full Access   | Full Access   | Full Access   | Masked Base   |
| **Alumni: Write**   | Allowed       | Allowed       | Allowed       | Denied        |
| **Alumni: Delete**  | Allowed       | Allowed       | Denied        | Denied        |
| **Alumni: Reveal Req**| Allowed     | Allowed       | Allowed       | Allowed       |
| **Alumni: Reveal Appr**| Allowed    | Allowed       | Allowed       | Denied        |
| **Import: Trigger** | Allowed       | Allowed       | Allowed       | Denied        |
| **Import: Cancel**  | Allowed       | Allowed       | Denied        | Denied        |
| **Import: Rollback**| Allowed       | Allowed       | Denied        | Denied        |
| **Review: Resolve** | Allowed       | Allowed       | Allowed       | Denied        |
| **Campaigns**       | Allowed       | Allowed       | Disabled(Send)| Denied        |
| **Users: Create**   | Allowed       | Allowed       | Denied        | Denied        |
| **Admin: Sessions** | Allowed       | Denied        | Denied        | Denied        |
| **Admin: Settings** | Allowed       | Denied        | Denied        | Denied        |
| **Export: Trigger** | Allowed       | Denied        | Denied        | Denied        |
