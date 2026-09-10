export const getWorksheetColumns = () => {
    return [
        { header: "User ID", key: "user_id", width: 10 },
        { header: "Username", key: "username", width: 20 },
        { header: "Email", key: "email", width: 30 },
        { header: "Name", key: "name", width: 25 },
        { header: "Company Title", key: "company_title", width: 25 },
        { header: "Organization", key: "organization", width: 25 },
        { header: "Roles", key: "roles", width: 30 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
        { header: "Updated At", key: "updated_at", width: 20 },
    ];
};