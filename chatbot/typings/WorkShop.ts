
export type UsersDeleteRequest = {
  workshopName: string,
  usersToDelete: string []
}

export type UsersCreateRequest = {
  responsableEmail: string,
  nbUsersToCreate: number
  workshopName: string,
  dateToDelete: string,
  groupName: string
}