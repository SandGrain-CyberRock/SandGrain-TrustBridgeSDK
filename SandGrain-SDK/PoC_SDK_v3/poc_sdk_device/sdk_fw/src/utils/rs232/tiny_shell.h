/****************************************************/
/*
** $RCSfile: tiny_shell.h,v $
**
** Copyright: Ikerlan 2003
** $Author: iarmendariz $
**
** Summary of functions:
** tiny_shell_return_code  TS_Set_Prompt(uint8_t *prompt);
**
** tiny_shell_return_code  TS_Get_Prompt(uint8_t *prompt, uint8_t *num_chars_p);
**
** tiny_shell_return_code
        TS_Add_Command(uint8_t *desc,   //!< a string to recognice the command: i.e. "help"
                     com_exe_f_cbp exec_function_p, //!< a callback pointer to call when the command is matched
                     com_help_f_cbp com_help_f_p  //!< a callback pointer to call when the user hits "tab" for help
                     );
**
** tiny_shell_return_code
        TS_Parse_Command(uint8_t *cmd_line,   //!< a string with a line (completed or not)
                     int8_t num_chars, //!< the legth of the giben command_line
                     uint8_t *result, //!< the result of parsing the command_line
                     int8_t *num_chars_res //!< the number of chars of the result
                     );
**
** $Log: tiny_shell.h,v $
** Revision 1.4  2013/05/06 21:12:44  iarmendariz
** Cambios introducidos para que funciones en LINUX. (faltarA?a adaptar linea serie pero TCP funciona OK).
**
** Revision 1.3  2011/11/02 07:08:52  iarmendariz
** Correccion de bugs en tinyshell y en RS232 para tcp
** Anadida funcion autodiagnostico para rs232.
**
** Revision 1.2  2011/09/23 06:44:50  iarmendariz
** Terminado porting de RS232 a STM32.
** RS232: incluida tecla DEL (0x7F) en el procesado.
**             ampliado limite de buffer admisible a 200 bytes para STM32
** tiny_shell: ampliada funcionalidad para mostrar ayuda al usuario dentro de un comando. Probado con comando version.
** main.c: ejemplo mas completo de uso de tiny_shell, incluyendo "version" con ejemplo de ayuda a primer parametro.
**
** Revision 1.1  2011/07/26 05:46:53  iarmendariz
** Corregidos bugs en rs232:
** anadido tiny_shell: En proceso de prueba.
** anadido log y semaforos asi como timer de alta precision.
**
**
**
*/

#ifndef TINY_SHELL_H
#define TINY_SHELL_H

#ifdef TINY_SHELL_M
	#define SCOPE /**/
#else
	#define SCOPE extern
#endif

/******************************************************************************
** Includes
*/

#include "Typedefs.h"
#if defined(LINUX)
	#include <netinet/in.h>
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <sys/types.h>
	#include <semaphore.h>

#endif

/******************************************************************************
** Includes
*/

typedef enum
{
	tiny_shell_success              = 0,
	tiny_shell_invalid_parameter    = 1,
	tiny_shell_invalid_function     = 2,
	tiny_shell_buffer_full          = 3,
	tiny_shell_recovered_command    = 4,
	tiny_shell_help_command = 5
} tiny_shell_return_code ;

typedef  int (* com_exe_f_cbp)(int argc, char *argv[]);
typedef int (* com_help_f_cbp)(char *argv[], int op_num, char *op_str, int *num_opts);

/******************************************************************************
** Defines
*/

/******************************************************************************
** Prototypes
*/
#ifdef __cplusplus
extern "C" {
#endif

/******************************************************************************
**
**          Set the default prompt, it should include the last space
** the default prompt is: "tiny_shell:> ". The prompt has a  limit of 20 chars.
**
** @return  operation result:
**      - \sa tiny_shell_success if the new prompt is recorded
**      - \sa tiny_shell_invalid_parameter: if the prompt parameter is null
**
******************************************************************************/
SCOPE tiny_shell_return_code  TS_Set_Prompt(uint8_t *prompt);

/******************************************************************************
**
**          Get the actual prompt, it include the last space and the second
** parameter tell how many chars has the prompt.
**
** @return  operation result:
**      - \sa tiny_shell_success if the new prompt is recorded
**      - \sa tiny_shell_invalid_parameter: if the prompt parameter is null
**
******************************************************************************/
SCOPE tiny_shell_return_code  TS_Get_Prompt(uint8_t *prompt, uint8_t *num_chars_p);

/******************************************************************************
**
**        Adds a new command to the shell.
** Before use the tiny shell the commands should be added using this function.
**
** @return  operation result:
**      - \sa tiny_shell_success if the new command is recorded
**      - \sa tiny_shell_invalid_parameter: if the first description string is not valid
**      - \sa tiny_shell_invalid_function: if the firts function is NULL.
**
******************************************************************************/
SCOPE tiny_shell_return_code
TS_Add_Command(uint8_t *desc,   //!< a string to recognice the command: i.e. "help"
               com_exe_f_cbp exec_function_p, //!< a callback pointer to call when the command is matched
               com_help_f_cbp com_help_f_p  //!< a callback pointer to call when the user hits "tab" for help
              );


/******************************************************************************
**
**        Parses a command line and gives the result.
** The command line can be complete or not. A complete line finish with a
** non-special shell character. A non-complete or special command line can be
** a one finished by CTRL-D o CTRL-U or CTRL_9 (TAB) or ESC(27)
** The function does the following action when the command-line finish with one
** of these special characters:
**   when: ctrl-d: the parser looks for the previous complete command stored in
**              internal buffer and updates the pointer backward to the internal
**        command line offset.
**   when: ctrl-u: the same as ctrl-d but moving the pointer forward.
**   when: tab is the las character of the line, it parses the given command line
**       and acts as follows:
**          if the command line is empty (only the prompt) it list all the
**          internal commands installed with (\sa TS_Add_Command() function)
**          if the command line is not empty counts the number of words and query
**          the installed help function for the first word with this number of words
**            if the first word doesn't match with any installed command do nothing.
**   otherwise: treat the comman line as a complete command and find the correspondign
**   matching an call to the command exe function. If no one is matched return a
**   error message and request a new command.
**
** @return  operation result:
**      - \sa tiny_shell_success if the new command is recorded
**      - \sa tiny_shell_invalid_parameter: if the first description string is not valid
**      - \sa tiny_shell_invalid_function: if the firts function is NULL.
**              - \sa tiny_shell_recovered_command
**              - \sa tiny_shell_help_command: if the result has a new line so it has to be carefully processed
******************************************************************************/
SCOPE tiny_shell_return_code
TS_Parse_Command(uint8_t *cmd_line,   //!< a string with a line (completed or not)
                 uint8_t num_chars, //!< the legth of the giben command_line
                 uint8_t *result, //!< the result of parsing the command_line
                 uint16_t *num_chars_res //!< the number of chars of the result
                );


#ifdef __cplusplus
}
#endif

#endif /*end guard */
#undef SCOPE

/*
** End of $RCSfile: tiny_shell.h,v $
******************************************************************************/





