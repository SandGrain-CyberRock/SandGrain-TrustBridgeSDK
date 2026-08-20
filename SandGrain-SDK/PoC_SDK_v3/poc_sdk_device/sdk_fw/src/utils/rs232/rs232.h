/****************************************************/
/*
** $RCSfile: rs232.h,v $
**
** Copyright: Ikerlan 2003
** $Author: iarmendariz $
**
** External dependency:
The application shoul provide the following function in (extern "C" format):

    extern void Local_Sleep(unsigned long milis);

**
** $Log: rs232.h,v $
** Revision 1.37  2019/10/09 12:26:21  iarmendariz
** Bugs menores y test nuevo incluyendo comunicaciones tcp localhost.
**
** Revision 1.36  2018/10/11 05:41:34  iarmendariz
** Eliminacion de warnings de compilador.
** Aclaracion de la ayuda de la funcion RS232_Parse_Uart_Info_Str()
** Inclusion de test TestSerialCommunicationParseString()
**
** Revision 1.35  2018/04/25 09:01:57  iarmendariz
** Eliminacion de warnings de compilacion.
** Corregido comentario funcion RS232_Parser... para cuando se usa con lineas serie.
** Creado un test para RS232_Parser...
**
** Revision 1.34  2017/11/09 17:11:00  iarmendariz
** Corregida descripcion de funcion RS232_Parse_Uart_Info.
** Protegidas funciones que son solo de Windows.
**
** Revision 1.33  2017/09/14 16:35:06  iarmendariz
** Anadida nueva funcion para control de los pines HW del puerto rs232 (RTS, DTR, CTS, CD y DSR).
** Corregido bug que hacia que servidor TCP perdiese primera trama recibida!
**
** Revision 1.32  2017/01/03 15:08:34  iarmendariz
** Anadida funcion de control de break para windows.
**
** Revision 1.31  2016/09/20 14:00:14  iarmendariz
** Icluida gestion corecta de paridad.
** Eliminadas variables staticas que producen problemas en entorno multihilo.
**
** Revision 1.30  2016/04/14 17:46:56  iarmendariz
** Anadido interfaz para cerrar conexion abierta de servidor tcp.
**
** Revision 1.29  2015/12/01 10:31:13  iarmendariz
** ajustes necesarios para compilar en linux yocto
**
** Revision 1.28  2015/10/06 13:29:40  iarmendariz
** Correccion de fuga de memoria y adaptacion para linux.
**
** Revision 1.27  2015/06/01 08:15:34  iarmendariz
** Corregido comportamiento de RS232_Get_Line() para cuando se quiere usar como entrada de passwords (tambien implica cambio en sdc.c).
**
** Revision 1.26  2014/01/11 14:39:36  iarmendariz
** Cambio de estrategia en recepcion de datos. ahora, en Atiende_recepcion si el buffer esta lleno no descarta el dato y deja que el incocante, hilo de recepcion, decida si espera o tira el dato.
** En MicroPC.C todos los printf se han protegido con la variable verbose.
**             Los sscanf para recoger los puertos no funcionan  en todos los sitemas linux y por eso se han sustituido por atoi().
**            Se han protegido todos los bucles para que pueda cerrarse adecuadamente el driver.
**             Cuando hay un error en la escritura no se pone en cerrado sino en solicitud de cerrado para tcp como cliente y como servidor para que puedacerrarse de manera adeuad el hilo de recepcion tambien. El no tener esto hecho provocaba que cuando se intentaba cerrar un puerto tcp con datos podia encontrarse error en el envio y el hilo de recepcion estar procewsando datos lo cual si ademas coincid con la solicitud de cierre del driver podia hacer situaciones en las que se provoca excepcion de puntero nulo en atiende_recepcion.
**             Mejorada la gestion de recepcion en sockets TCP cercano a buffer lleno.
**            En la solicitud de conexion, aunque parece que eso nunca pasa en windows, en linux puede devovelr un error que es EINPROGRESS y por tanto no se debe considerar como un error.
**
** Revision 1.25  2013/09/05 14:45:45  iarmendariz
** Recompilada la navaja suiza de las comunicaciones ;-)
**
** Revision 1.24  2013/07/24 15:56:59  iarmendariz
** Mejorado tiempo en NutTcpReceive().
** rs232: incorporada funcion RS232_Get_Line_No_Echo()
**
** Revision 1.23  2013/05/06 21:12:43  iarmendariz
** Cambios introducidos para que funciones en LINUX. (faltaria adaptar linea serie pero TCP funciona OK).
**
** Revision 1.22  2013/03/15 18:56:46  iarmendariz
** Implementado mecanismo para que no se use hilos y se pueda invocar desde una tarea sin bloquearse y realizando las recepciones.
** Implementado para kinetis y para PC funciones vacias.
** Corregido bug de asinga numero de indice a sd_keyb que hacia que no pudiese funcionar el serial9 (com9) del PC. (se ha desplazado a 99)
**
** Revision 1.21  2013/03/13 07:33:16  iarmendariz
** rs232.c: posibilitado puerto serie mas de 10 (habia un limite por error)
**               anadido mensajeria UDP y cambiado el actual USOCKET a RSOCKET
**               Implementado un cambio en RS232_Read de manera que si el numero timeout es negativo !=-1 espera recibiendo caracteres mientras que la distancia entre recepciones no supere el intervalo dado en valor absoluto.
** rtp.c: corregido para envio y recepcion correcta de UDPs
** micro_pc.c: corregido y ampliado para distinguir RTP y UDP.
** win32shell (csk): corregido comentario, solo reintenta conexion en caso de que destinatario sea csocket, delta de tiempos en 10ms y funcionando OK.
**
** Revision 1.20  2013/02/05 11:20:07  iarmendariz
** Incorporado mecanismo que permite invocar conexiones por Nombre y no solo por IP. Usada en conexiones TCP cliente.
** Actualizacion de version e introduccion de mecanismo para realizar un AUTOTEST en el que incluya medida consumo de stack y heap (en desarrollo).
**
** Revision 1.19  2013/01/14 09:53:15  iarmendariz
** Incluido nuevo metodo para conocer el nombre del nodo conectado cuando estamos en TCP server. Para PC y para kinetis.
** Incluye la necesidad de un campo peer_name de 30 caracteres en la estructura sdo.
**
** Revision 1.18  2013/01/03 09:06:21  iarmendariz
** Incluida funcion para conocer el estado de una conexion. Es util cuando se abre el puerto en modo servidor TCP que puede estar conectado o no dependiendo del cliente.
**
** Revision 1.17  2012/12/17 09:44:21  iarmendariz
** Unificacion en la gestion de tablas para el driver interno y de alto nivel.
**
** Revision 1.16  2012/12/14 08:07:29  iarmendariz
** Unificacion de puertos entre bajo nivel de driver y alto nivel.
** Porting para kinetis de freescale.
**
** Revision 1.15  2012/11/08 08:55:35  iarmendariz
** Incorporado servicios web y Corregidos bugs para que funcionen los servicios web.
** Incorporado proyecto para eclipse con mingw.
**
** Revision 1.14  2012/10/23 19:55:37  iarmendariz
** Incluida una funci?n para poder activar/desactivar el modo loopback del driver.
** Varios ajustes en las funciones que usa la tiny_librer?a de servicios web (bugs)
**
** Revision 1.13  2012/10/17 08:06:41  iarmendariz
** A?adida funcion Enqueue y cambiada la RS232_Flush() para poder enviar paquetes de mas de 1 byte por TCP.
** En tcp desglosado sem_tcp para disponer de uno por vector en lugar de uno para todos.
**
** Revision 1.12  2012/10/12 06:56:48  iarmendariz
** Integrada funcion de parseo de string para facilitar la apertura del driver.
**
** Revision 1.11  2012/10/09 10:02:16  iarmendariz
** Modificaciones en el driverRS232 para que admita m?s de una conexi?n (hasta 100) en los puertos de sockects (clientes e UDPs).
** He probado con abrir dos TSOCKETS y funciona OK. Cuando cierra hay un problema que el socket se queda bloqueado hasta recibir un caracter y por ello no lo gestiona bien. Habr?a que enviarle una se?al o algo al socket en la funci?n finalizar... pero de momento no est? implementado.
**
** Revision 1.10  2012/01/25 09:19:27  iarmendariz
** Ajustes de tiempo en micro_pc para que funcione bien canopen_tester (udp).
** Incorporaci?n de semaforos en rs232
** Correccion de bug en tiny_shell funcion TS_Add_Command() que no retornaba ts_success sino el numero de comandos.
**
** Revision 1.9  2012/01/03 16:39:39  iarmendariz
** Incluida nuevo porting para freescale con micro de la fmilia k60p144m100sf2, concretamente el MK60X256VMD100 y adem?s con sistema operativo MQX 3.7.
** Se ha realizado el porting del driver de linea serie y se compila con eclipse "CW_MCU_v10.1_B110726_SE.exe" y aplicado el update MCU_v10.1_Compiler_Update_ColdFire_Kinetis_Qorivva_for_Windows.zip.
** Compila sin errores y aen el micro de kinetis se hace llamadas a las funciones de MQX para abrir, enviar y recibir del puerto serie mediante interrupciones. Falta probarlo en la tarjeta que nos han dejado.
**
** Revision 1.8  2011/11/09 07:04:06  iarmendariz
** RS232: incluido sem?foro para handle de uart a nivel de API superior.
** rtp.c: ajustado para funcionamiento con socket abierto con timeout en windows.
** Micro_pc.c: incluido sem?foros y sockets udp con timeout.
** Canopen_test_sali: actualizado diccionario de par?metros.
**
** Revision 1.7  2011/11/02 07:08:52  iarmendariz
** Correcci?n de bugs en tinyshell y en RS232 para tcp
** A?adida funcion autodiagnostico para rs232.
**
** Revision 1.6  2011/09/29 08:54:01  iarmendariz
** Actualizada la documentaci?n de las funciones de rs232 en castellano pero completa.
**
** Revision 1.5  2011/09/02 13:52:52  iarmendariz
** Limpieza de c?digo sobrante en el main.
** A?adidos comentarios al driver RS232 para su uso desde la aplicaci?n de renesas.
** Corregido bug en gesti?n del string de versiones.
**
** Revision 1.4  2011/07/29 16:50:02  iarmendariz
** Introducido c?digo para UART. La UART1 da muchos problemas y dice que no se puede usar con el debugger! Ahora consigo que env?e pero no he conseguido que reciba Bien.
**
** Revision 1.3  2011/07/26 05:46:52  iarmendariz
** Corregidos bugs en rs232:
** a?adido tiny_shell: En proceso de prueba.
** a?adido log y semaforos as? como timer de alta precision.
**
** Revision 1.2  2011/06/17 16:48:19  iarmendariz
** Cambios para que el driver sea mas portable. Compila OK en windows pero esta incompleto aun.
** Movido el de renesas y no se ha compilado aun.
**
** Revision 1.1  2011/06/06 13:38:32  iarmendariz
** A?adido driver c?digo original de RS232. Falta adaptar al chip de renesas.
**
**
*/

#ifndef RS232_H
#define RS232_H


#if defined(W64B) || defined(WIN32)
	#include "stdint.h"
#else
	#include "Typedefs.h"
#endif
#if defined(LINUX)
	#include <netinet/in.h>
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <sys/types.h>
	#include <semaphore.h>

#endif

#ifdef RS232_M
	#define SCOPE /**/
#else
	#define SCOPE extern
#endif

/******************************************************************************
** Includes
*/



/******************************************************************************
** Defines
*/

//!< define number of available ports
enum
{
#if defined(WIN32) || defined(LINUX)
	max_uart_handles            = 1000,//!< serial ports
	max_others_handles          = max_uart_handles - 100, //!< other ports tcp udp ...
#else
	max_uart_handles            = 7, //!< serial ports
	max_others_handles          = max_uart_handles - 1 //!< other ports tcp udp ...
#endif
};

enum
{
	rs232_false = 0,
	rs232_true  = 1
};

enum
{
	rs232_echo_off  = 0,
	rs232_shell_off = 0,
	rs232_echo_on   = 1,
	rs232_shell_on  = 2,
	rs232_echo_pass = 3
};

enum
{
	rs232_closed = 3,
	rs232_op_setup = 1,
	rs232_op_accept = 2,
	rs232_op_connected = 0,
	rs232_close_req = 4,
	rs232_close_ok = 5
};

enum
{
	rs232_stack_test = 1 << 0, //!< check the stack used by the library
	rs232_heap_test =  1 << 1, //!< check the heap used by the library
	rs232_loop_back = 1 << 2, //!< check if the driver works fine sending and receiving in loopback mode
	rs232_connect_test = 1 << 3, //!< check if the uart is connected
	rs232_get_line_test = 1 << 4, //!< check the get_line function
	rs232_enqueue_test = 1 << 5, //!< check if the enqueue+flush funtions works as espected in loopback mode
};

#define rs232_null (void *)0
enum
{
	rs232_zero = 0,
	rs232_buffer_full = 1,
	rs232_buffer_data = 2,
	rs232_buffer_empty = 3
};

typedef  enum
{
	sd_uart0    = 0,
	sd_uart1    = 1,
	sd_uart2    = 2,
	sd_uart3    = 3,
	sd_uart4    = 4,
	sd_uart5    = 5,
	sd_uart6    = 6,
	sd_uart7    = 7,
	sd_uart8    = 8,
	sd_keyb     = 99,
	sd_usocket  = 100,//it must be 100 port per kind
	sd_tsocket  = 200,
	sd_csocket  = 300,
	sd_rsocket  = 500,//it must be 100 port per kind
	sd_end      = 600
} uart_number;

typedef enum
{
	/* UART Mode Definition Bits */
	sd_parity_none              = 0,
	sd_stop_bits_1              = 0x1,
	sd_stop_bits_2              = 0x2,
	sd_parity_odd               = 0x03,
	sd_parity_even              = 0x04,
	sd_data_bits_5              = 0x05,
	sd_data_bits_6              = 0x06,
	sd_data_bits_7              = 0x07,
	sd_data_bits_8              = 0x08,
	sd_mode_normal              = 0x09,
	sd_mode_auto_echo           = 0x0a,
	sd_mode_local_loop          = 0x0b,
	sd_mode_remote_loop         = 0x0c,
	sd_serial_mode              = 0x0d
} uart_mode_definition_bits;

enum
{
	DATA_BITS_7 = 1,
	DATA_BITS_8 = 2
};

enum
{
	STOP_BITS_1 = 1,
	STOP_BITS_2 = 2
};

enum
{
	parity_none = 1
};

enum
{
	MODE_NORMAL     = 1,
	SERIAL_MODE     = 2
};

//return codes
typedef enum
{
	rs232_success                           = 0,
	rs232_invalid_parity                    = -1,
	rs232_invalid_data_bits                 = -2,
	rs232_invalid_stop_bits                 = -3,
	rs232_invalid_baud                      = -4,
	rs232_invalid_com_port                  = -5,
	rs232_invalid_data_mode                 = -6,
	rs232_uart_list_full                    = -7,
	rs232_invalid_buffer_pointer            = -8,
	rs232_null_parameter                    = -9,
	rs232_no_line_readed                    = -10,
	rs232_problems_closing_uart             = -11,
	rs232_error_uart_can_not_be_opened      = -12,
	rs232_error_invalid_uart_handle         = -13,
	rs232_error_not_enough_memory           = -14,
	rs232_error_null_parameter_given        = -15,
	rs232_error_invalid_configuration       = -16,
	rs232_error_already_configured          = -17,
	rs232_error_flush_timeout               = -18,
	rs232_error_not_all_test_passed         = -19,
	rs232_error_not_active_con_found        = -20,
	rs232_error_con_shutdonw_failure        = -21,
	rs232_error_not_implemented_yet         = -100
} rs232_return_code;


/* Define data structures for management of a serial port. */
typedef int rs232_handle;

typedef struct
{
	uint32_t baud_rate;
	uint8_t data_bits;
	uint8_t stop_bits;
	uint8_t parity;
	uint8_t data_mode;
	uint8_t communication_mode;
	uint16_t sd_buffer_size;
	uint8_t url[60];
#if defined(GBMS)
	uint16_t uart_desc;
#else
	uart_number uart_desc;
#endif
	uint8_t echo;
	uint8_t shell;

} rs232_conf_st;

/******************************************************************************
** Prototypes
*/
#ifdef __cplusplus
extern "C" {
#endif


/******************************************************************************
** External dependencies
*/
#if (!defined(LINUX) && !defined(sem_t))
#define sem_t void *
#endif
extern void Local_Sleep(unsigned long milis);
extern void Local_Sem_Wait(sem_t *sem);
extern void Local_Sem_Post(sem_t *sem);
extern void Local_Sem_Init(sem_t *sem, int p1, int p2);
extern int Local_Sem_Close(sem_t *sem);
#if !defined(LINUX)
extern void sem_init(sem_t *sem, int p1, int p2);
extern int sem_try_wait(sem_t *sem);
extern void sem_wait(sem_t *sem);
extern void sem_post(sem_t *sem);
extern int sem_close(sem_t *sem);
#endif//LINUX
/**
** the string uart_desc_ori is a C type string (null terminated) with portNsetting as follows:
** portNsettigns has the following format:
**  portname,speed,parity,numberofbits,echo,shell
**  where portname (followed with baudrate,parity,numbits only for serial ports) can be:
**      a serial port number like SERIAL1:115200,N,8 | SERIAL2:115200,N,8 | ..
**      or the keyboard/display KEYB
**      or an UDP socket: USOCKET:224.1.2.3:1234:5678 (where first port is rx port and second tx port)
**      or a TCP client socket: CSOCKET:172.16.4.57:1234 (where URL identifies the server to which connect)
**      or a TCP server socket: TSOCKET:1234 (where the port indicates the listening port at which the application will wait 1 connection)
**  where speed is in bps, num_of_bits (5,6,7,8), parity (N,O,E), stop_bits (0,1,2) (only for serial)
**  and finally, echo (N,E,X) and shell (N or S).
**
** if the parsing was OK (return 0) the valid config is stores in uart_config_p.
** REMEMBER to asign a valid uart_config_p->sd_buffer_size after calling this function! By default this
** function asigns 128 bytes to it.
**
** if the parsing was wrong return -1;
**/
int RS232_Parse_Uart_Info_Str(char *uart_desc_ori, rs232_conf_st *uart_config_p);

/*****************************************************************************/
/**
Solicitud de apertura del driver para su uso con un puerto especificado.
Par?metros:     uart: dato de entrada con el identificador del puerto serie que
se quiere utilizar (es del tipo uart_number ={sd_uart0 | sd_uart1}).
        uart_handle_p: uart_handle *: puntero a una variable tipo
"uart_handle" en la cual el driver devuelve el manejador del puerto que deber?
ser usado como primer par?metro en el resto de las funciones del API.
        uart_config_p: rs232_conf_st *: puntero a la estructura que
configura el modo en el que el puerto ha de ser usado. El puntero puede ser
NULO en cuyo caso el driver se inicializa con los valores por defecto.
La estructura "rs232_conf_st" se define como:
typedef struct
{
uint16_t baud_rate; // !< velocidad del puerto en bit por segundo
uint8_t data_bits;    // !< n?mero de bits del puerto
uint8_t stop_bits;   // !< n?mero de bits de parada
uint8_t parity;         // !< paridad
uint8_t data_mode; //
uint8_t communication_mode;
uint8_t sd_buffer_size;
@rerutn :   Devuelve el resultado de la acci?n. Si se ha podido abrir el
puerto correctamente el resultado es rs232_success y en uart_handle_p est? el
manejador("handle") del puerto. Si se ha producido alg?n error se devuelve un
c?digo de los siguientes y el puntero del "handle" ser? NULO. El resultado es
del tipo rs232_return_code:
    rs232_error_invalid_uart_handle: El par?metro de entrada no s v?lido.
    rs232_error_already_configured: El puerto ya ha sido abierto
anteriormente.
    rs232_error_uart_can_not_be_opened: Falta de recursos para poder
abrir el Puerto

Comentarios:    Esta es la primera funci?n a la que se ha de invocar para
poder utilizar el puerto deseado. Es importante verificar que el resultado
de invocar a esta funci?n es rs232_success. En caso contrario ninguna de las
otras funciones podr?n usarse por no disponer de un handle v?lido. Adem?s de
configurar el puerto como se desee empleando el tercer par?metro,
posteriormente se puede cambiar su configuraci?n empleando
la funci?n "RS232_Configure" descrita m?s adelante.

} rs232_conf_st;

*/
SCOPE rs232_return_code RS232_Open(uart_number uart,
                                   rs232_handle *uart_handle_p,
                                   rs232_conf_st *pRequest);



/*****************************************************************************/
/**
** Purpose: Close port and if necessary disconnect the MicroMonitor
**
** Input Parameters:
**      a pointer to a SD_PORT structure used to comunicate with the port
**
** @return Parameter:  Devuelve un c?digo de resultado siendo rs232_success
si todo ha ido bien y en caso contrario retorna el siguiente c?digo de entre
los del tipo "rs232_return_code":
"   rs232_problems_closing_uart: indicando que el "manejador/handle" no
estaba en uso.
Comentarios:    Esta funci?n se emplea para liberar el puerto de comunicaciones
que se estaba usando. Despu?s de invocar a esta funci?n se debe invocar a
RS232_Open() nuevamente si se quiere volver a utilizar el puerto de
comunicaciones
**/
SCOPE rs232_return_code  RS232_Close(rs232_handle uart);

/*****************************************************************************/
/**
** Purpose: Close the active connection  if the driver is running as tcp server.
** The tcp port remains open and is waiting for another connection.
**
** Input Parameters:
**      a pointer to a SD_PORT structure used to comunicate with the port
**
** @return Parameter:  Returns \sa rs232_success if successful closed,
** else it returns \sa rs232_error_not_active_con_found
** or
** rs232_error_con_shutdonw_failure
**
*/

SCOPE rs232_return_code RS232_Close_Tcp_Server_Active_Connection(rs232_handle uart
        /*!< a pointer to a SD_PORT structure used to comunicate with the port */
                                                                );

/*****************************************************************************/
/**
Se invoca a esta funci?n una vez que el puerto se ha abierto con RS232_Open()
con el objetivo de leer o recibir un conjunto de caracteres. La lectura puede
ser de uno o m?s caracteres y adem?s puede ser bloqueante o no dependiendo del
timeout indicado.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        read_buf_p: uint8_t *: puntero a un buffer para poder recibir
los caracteres solicitados.
        num_cars: uint16_t: indica la capacidad m?xima del buffer de
recepci?n.
        num_cars_readed_p: uint16_t *: es el puntero a una variable en
la que la funci?n indicar? el n?mero de caracteres escritos en el buffer de
recepci?n proporcionado.
        timeout: int32_t: indica el tiempo en milisegundos que la
funci?n permanecer? bloqueada recibiendo antes de retornar. Si el valor es 0 la funci?n se queda
permanentemente bloqueada hasta recibir "num_cars" caracteres. Si el par?metro
toma un valor negativo(-1), la funci?n retorna inmediatamente con los caracteres
que se tengan en el driver. Si el par?metro toma un valor negativo diferente a -1, (recibe un mensaje) la funci?n se
bloquear? y esperar? a recibir caracteres en el intervalo establecido por el valor absoluto del
par?metro, es decir si vale -100 se quedar? bloqueada hasta que se superen 100ms desde el ?ltimo
car?cter recibido o se alcance el n?mero de bytes indicado. Se considera mensaje a todos los bytes
que se reciban con un intervalo inferior al indicado por el parametro (en el ejemplo) 100ms.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si todo ha ido bien.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
"   rs232_invalid_buffer_pointer: El puntero al buffer de lectura es NULO.

Comentarios:    Esta funci?n permite recibir caracteres del puerto indicado.
Previamente a la invocaci?n a esta funci?n se ha debido abrir el puerto con
RS232_Open(). Los caracteres que se obtienen con esta funci?n se eliminan del
buffer del driver.
*/
SCOPE rs232_return_code   RS232_Read(rs232_handle uart, uint8_t *read_buf_p, uint16_t num_cars,
                                     uint16_t *num_cars_readed, int32_t timeout);

/*****************************************************************************/
/**
Se invoca a esta funci?n una vez que el puerto se ha abierto con RS232_Open()
con el objetivo de escribir o enviar un conjunto de caracteres. La escritura
puede ser de uno o m?s caracteres y adem?s puede ser de una cadena terminada
con el car?cter 0 o no (seg?n el tercer par?metro).
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        write_buf_p: uint8_t *: puntero a un buffer que contiene los
caracteres que se quieren enviar.
        num_cars: uint16_t: indica la cantidad de caracteres que se
quieren enviar. Si el valor es cero, el buffer contiene una cadena que termina
en 0 (tipo usados en C). El 0 no se env?a. Si el valor es distinto de cero,
indica el n?mero de caracteres a enviar comenzando por la posici?n 0 del
buffer indicado.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si todo ha ido bien.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
"   rs232_invalid_buffer_pointer: El puntero al buffer de env?o es NULO.

Comentarios:    Esta funci?n permite enviar caracteres al puerto indicado.
Previamente a la invocaci?n a esta funci?n se ha debido abrir el puerto con
RS232_Open(). Los caracteres se pasan al  driver y el driver sale en cuanto
los recepciona en su buffer. Se puede enviar una cadena de caracteres terminada
en '0' (como las usadas en C) sin tener que contar los caracteres que
la contienen.

**
*/
SCOPE rs232_return_code   RS232_Write(rs232_handle uart, uint8_t *characters_to_write,
                                      uint16_t num_chars);

/*****************************************************************************/
/**
El uso de esta funci?n permite saber el nivel de ocupaci?n del buffer de salida
del driver.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).

Retorno:    El resultado ser? un n?mero positivo indicando el n?mero de
caracteres pendientes de enviarse por el puerto o si ha ocurrido alg?n problema
retorna un n?mero negativo con alguno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Esta funci?n permite saber el n?mero de caracteres que quedan
pendientes de env?o en el puerto indicado. Previamente a la invocaci?n a esta
funci?n se ha debido abrir el puerto con RS232_Open() o de lo contrario devuelve
el c?digo de error de handle invalido.
*/
SCOPE int16_t RS232_Get_Num_Chars_To_Send(rs232_handle uart);

/*****************************************************************************/
/**
El uso de esta funci?n permite saber el nivel de ocupaci?n del buffer de
entrada del driver. Son el n?mero de caracteres que se han recibido pero a?n
no se han extra?do del driver.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).

Retorno:    El resultado ser? un n?mero positivo indicando el n?mero de
caracteres pendientes de extraerse del driver o si ha ocurrido alg?n problema
retorna un n?mero negativo con alguno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Esta funci?n permite saber el n?mero de caracteres que quedan
pendientes de env?o en el puerto indicado. Previamente a la invocaci?n a esta
funci?n se ha debido abrir el puerto con RS232_Open() o de lo contrario
devuelve el c?digo de error de handle invalido.
*/
SCOPE int16_t RS232_Get_Num_Chars_Available(rs232_handle uart);


/*
* Permite encolar caracteres en la cola, util para conexiones TCP en las que
* se quiere enviar paquetes de mas de 1 bit. Al final se debe invocar a
* RS232_Flush() para que los env?e realmente.
*
*/
SCOPE rs232_return_code RS232_Enqueue(rs232_handle uart,
                                      /*!< a pointer to a SD_PORT structure used to comunicate with the port */
                                      uint8_t *characters_to_write,
                                      /*!< a pointer to the characters to be writen */
                                      uint16_t num_chars /*!< the number of characters to print if zero the
             string is null terminated string like in C.*/
                                     );


/*****************************************************************************/
/**
El uso de esta funci?n permite saber el nivel de ocupaci?n del buffer de
entrada del driver. Son el n?mero de caracteres que se han recibido pero a?n
no se han extra?do del driver.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        timeout: uint32_t: es el tiempo m?ximo en milisegundos que
espera a que se vac?e el buffer de transmisi?n antes de borrarlo.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transisi?n se ha vaciado antes de que
se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
"   rs232_error_flush_timeout: tiempo en milisegundos para esperar a que
el driver vac?e el buffer de transmisi?n.

Comentarios:    Esta funci?n permite esperar a que se vac?e el buffer de
transmisi?n. Es una manera de saber el momento en que se ha terminado de
transmitir los datos a enviar. Si transcurrido el tiempo indicado no se
han enviado los datos, los que quedan sin enviar se eliminan del buffer de
transmisi?n. Previamente a la invocaci?n a esta funci?n se ha debido abrir
el puerto con RS232_Open() o de lo contrario devuelve el c?digo de error de
handle invalido.
**
*/
SCOPE rs232_return_code  RS232_Flush(rs232_handle uart, uint32_t timeout);

/*****************************************************************************/
/**
El uso de esta funci?n permite vaciar el buffer de recepci?n eliminando
su contenido.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido
tras la inicializaci?n (RS232_Open()).

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Esta funci?n permite vaciar el buffer de recepci?n.
Previamente a la invocaci?n a esta funci?n se ha debido abrir el puerto
con RS232_Open() o de lo contrario devuelve el c?digo de error de handle
invalido.
**
*/
SCOPE rs232_return_code  RS232_Reset_Reception_Buffer(rs232_handle uart);

/*****************************************************************************/
/**
El uso de esta funci?n permite activar la funcionalidad de "echo" del driver.
Esta funcionalidad consiste en enviar por el puerto de salida cada car?cter
recibido por el driver en el puerto de entrada. Cuando el driver se abre con
la funci?n RS232_Open () esta funcionalidad se inicializa desactivada.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        echo_status: uint8_t: variable  donde el valor
rs232_echo_off desactiva la funcionalidad y con el valor rs232_echo_on lo activa
y el valor rs232_echo_pass lo activa pero oculta los valores introducidos haciendo
echo de *.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Esta funci?n es ?til si se quiere usar con terminales est?ndar
tipo "hyperterminal". Previamente a la invocaci?n a esta funci?n se ha debido
abrir el puerto con RS232_Open() o de lo contrario devuelve el c?digo de error
de handle invalido.
**
*/
SCOPE rs232_return_code  RS232_Set_Echo(rs232_handle uart, uint8_t echo_status);

/*****************************************************************************/
/**
El uso de esta funci?n permite activar la funcionalidad de las funcionalidades
de ayuda al "shell" del driver. Esta funcionalidad consiste en monitorizar los
caracteres recibidos por el puerto y lanzar determinadas acciones ante
caracteres especiales. Los caracteres especiales que se monitorizan son el
ESC(27), DEL (8), CTRL_U(21) y CTRL_D(4). Cuando se recibe un car?cter de
estos se realizan diferentes acciones solo si est?n activadas. La activaci?n
o desactivaci?n de dichas funcionalidades se hace mediante esta funci?n.
Cuando el driver se abre con la funci?n RS232_Open () esta funcionalidad
se inicializa desactivada.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido
tras la inicializaci?n (RS232_Open()).
        echo_status: uint8_t: variable booleana donde el valor
rs232_shell_off desactiva la funcionalidad y con el valor rs232_shell_on
lo activa.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Esta funci?n es ?til si se quiere usar con terminales
est?ndar tipo "hyperterminal". La acci?n predeterminada para todos ellos
excepto el car?cter DEL(8) es la de avisar interpretarlo como un indicador
de "fin de l?nea" de manera que si la aplicaci?n est? a la espera de recibir
una l?nea recibe (RS232_Get_Line()  o RS232_Get_Line_Callback() todos los
caracteres tecleados hasta el momento sin esperar a un '\n' o  '\r'.
Previamente a la invocaci?n a esta funci?n se ha debido abrir el puerto con
RS232_Open() o de lo contrario devuelve el c?digo de error de handle invalido.
**
*/
SCOPE rs232_return_code  RS232_Set_Shell_Utils(rs232_handle uart, uint8_t shell_status);

/*****************************************************************************/
/**
El principal objetivo de esta funci?n es recibir una l?nea completa. Mediante
el par?metro "timeout" se puede bloquear hasta recibir una l?nea o esperar un
tiempo determinado (incluyendo 0). Adem?s, se puede, opcionalmente, enviar un
mensaje a la vez que se solicita la l?nea. Esta funcionalidad es muy ?til
cuando se est? implementando un terminal virtual pues permite enviar el
"prompt" del sistema en la recogida de la l?nea.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido
tras la inicializaci?n (RS232_Open()).
        echo_status: uint8_t: variable booleana donde el valor
rs232_shell_off desactiva la funcionalidad y con el valor rs232_shell_on
lo activa.
            p_rec_buffer: int8_t *: puntero al buffer donde se quiere
recibir la l?nea.
                    num_chars: int16_t: tama?o disponible en el buffer
de reepci?n.
                    num_reaeded_chars_p: int16_t *: puntero a una
variable en la que al salir de la funci?n se tiene el n?mero de caracteres
v?lidos disponibles en el buffer de recepci?n.
                    ini_buffer_p: uint8_t *: puntero al buffer de
inicializaci?n o env?o a la hora de recibir la l?nea. Puede ser nulo si no
se quiere enviar nada.
                    ini_buffer_size: uint16_t: n?mero de caracteres en
el buffer de env?o. Si este par?metro es 0 y ini_buffer_p es no nulo el
string se considera un string tipo "C", es decir, debe terminar en un 0.
En caso contrario el tama?o indica que el buffer no termina en 0.
                    timeout: int32_t: valor que indica el tiempo de espera.
Si es negativo se queda bloqueado hasta recibir una l?nea completa.
Si es 0 retorna inmediatamente haya o no l?nea y si es >0 indica el tiempo
en milisegundos que la funci?n espera a disponer de una l?nea. Si se tiene
la l?nea antes se sale con la l?nea.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
"   rs232_null_parameter: Si el puntero al buffer de recepci?n es nulo.
"   rs232_no_line_readed: si ha excedido el tiempo y no se ha le?do
ninguna l?nea.

Comentarios:    La funci?n decide que ha recibido una l?nea cuando se recibe
alguno de los caracteres '\n' o '\r' (10 o 13). Adem?s, si se ha activado la
funcionalidad de la "Shell_utils" tambi?n considera l?nea completa cuando se
teclea los caracteres especiales considerados para el Shell(ver
RS232_Set_Shell_Utils ()). Previamente a la invocaci?n a esta funci?n se ha
debido abrir el puerto con RS232_Open() o de lo contrario devuelve el c?digo
de error de handle invalido.
**
*/
SCOPE rs232_return_code  RS232_Get_Line(rs232_handle uart,
                                        uint8_t * rec_buffer_p,
                                        int16_t num_chars,
                                        int16_t * num_readed_chars_p,
                                        uint8_t * ini_buffer_p,
                                        int16_t ini_buf_size,
                                        int32_t timeout
                                       );

/*
 * Same as RS232_Get_Line(..) but without activating the echo
 */
SCOPE rs232_return_code  RS232_Get_Line_No_Echo(rs232_handle uart,
        /*!< a pointer to a SD_PORT structure used to comunicate with the port */
        uint8_t * p_rec_buffer, /*!< A pointer to the reception buffer */
        int16_t num_chars, /*!< The length of the reception buffer */
        int16_t * p_num_readed_chars, /*!< A pointer to a variable for returning
            the number of received chars */
        uint8_t * p_ini_buffer, /*!< A pointer to the initialisation buffer. If
            this pointer is !=null the content of the buffer is used to
            initialise the reception buffer. */
        int16_t ini_buf_size, /*!< the number of chars inside p_ini_buffer */
        int32_t timeout /*!< Timeout for getting a line. If its value is 0
      the funtion only returns when a line has received. If its value is
      positive its indicates a time bound after which the function returns.
      And, at last, if the value is negative the function returns inmediatelly.
      */
                                               );


/*****************************************************************************/
/**
 Esta funci?n permite instalar en el driver una funci?n de determinado tipo
de manera que el driver pueda invocarla cuando se recibe una l?nea completa
(la decisi?n de cuando recibe una l?nea es la misma que la funci?n
RS232_Get_Line). El driver solo har? usar? la funci?n dada si est?n activada
la funcionalidad de "shell-utils".
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        line_fn_p: void (*(uint8_t *line): puntero a una funci?n que
no retorna nada pero admite como par?metro una l?nea terminada en el car?cter 0.
Admite un puntero a funci?n nulo (lo cual borra la anterior funci?n resgistrada
en el driver).

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    Para anular la funci?n previamente instalada con esta funci?n
se ha de invocar a esta misma funci?n con un puntero a funci?n NULO. La funci?n
decide que ha recibido una l?nea con el mismo criterio que la funci?n
RS232_Get_Line() con la funcionalidad "Shell-utils" activada. Se ha de tener
en cuenta que si la funcionalidad de "Shell-utils" no est? activa el driver
no hace uso de esta funci?n debido a que no analiza el contenido de los
caracteres recibidos. Previamente a la invocaci?n a esta funci?n se ha debido
abrir el puerto con RS232_Open() o de lo contrario devuelve el c?digo de error
de handle invalido.
**
*/
SCOPE rs232_return_code  RS232_Get_Line_Callback(rs232_handle uart,
        void (*p_line_fn)(uint8_t * line)
                                                );

/*****************************************************************************/
/**
**
Esta funci?n permite instalar en el driver una funci?n de determinado
tipo de manera que el driver pueda invocarla cuando se recibe una l?nea
completa (la decisi?n de cuando recibe una l?nea es la misma que la funci?n
RS232_Get_Line). El driver solo har? usar? la funci?n dada si est?n activada
la funcionalidad de "shell-utils".
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        buffer_p: uint8_t *: puntero a un buffer en el cual el driver
escribe su informaci?n de versi?n.
        bf_size: uint16_t: indica el espacio m?ximo reservado para
devolver la informaci?n de la versi?n.

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_null_parameter: El par?metro de entrada no es v?lido.

Comentarios:    El resultado de esta funci?n es algo como "01_00_b00 Jul
8 2011 07:58:04" Donde los primeros dos d?gitos corresponden con el Major
number (01) los segundos corresponden con el minor number (00) y los dos
digitos detr?s de la letra que puede ser 'b' o 'r' (beta o release).
La fecha y hora indicadas corresponden con el momento de la compilaci?n.
Para invocar a esta funci?n no hace falta tener el driver abierto.
**
******************************************************************************/
SCOPE rs232_return_code  RS232_Get_Version_Info(uint8_t *buffer, uint16_t bf_size);

/******************************************************************************
**
Esta funci?n permite cambiar la configuraci?n asignada al puerto en el momento
de la apertura del mismo.
Par?metros:     uart_h: es el manejador del puerto que se hab?a obtenido tras
la inicializaci?n (RS232_Open()).
        uart_config_p: rs232_conf_st *: puntero a la estructura que
configura el modo en el que el puerto ha de ser usado. El puntero puede ser
NULO en cuyo caso el driver se inicializa con los valores por defecto.
La estructura "rs232_conf_st" se define en la funci?n RS232_Open ()

Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":

"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.

Comentarios:    La llamada a esta funci?n provoca un cierre y una nueva
apertura del puerto con la nueva configuraci?n. Previamente a la invocaci?n
a esta funci?n se ha debido abrir el puerto con RS232_Open() o de lo contrario
devuelve el c?digo de error de handle invalido.
**
******************************************************************************/
SCOPE rs232_return_code  RS232_Configure(rs232_handle uart,
        rs232_conf_st *pRequest);

SCOPE int RS232_Printf(rs232_handle uart, char *msg, ...);

SCOPE int RS232_Auto_Test(rs232_handle uart);


/*****************************************************************************/
/**
** Purpose: Set the driver in loopback mode or normal mode depending of the
**  parameter rs232_true of rs232_false
**
** @return Parameter: always success
**
*/
SCOPE rs232_return_code RS232_Set_Loopback_Mode(rs232_handle uart, unsigned char state);

/*****************************************************************************/
/**
** Purpose: to know the connection state of tcp server modes
**
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
**
*/
SCOPE rs232_return_code RS232_Get_Status(rs232_handle uart, unsigned int *statep);


/*****************************************************************************/
/**
** Purpose: to know the connection url. In the tcp server mode it shoul return
** the peer url
**
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
**
*/
SCOPE rs232_return_code RS232_Get_Peer_Name(rs232_handle uart, char *name, unsigned short size);

/*****************************************************************************/
/**
** Purpose: This function runs a preselected test suit over the library.
** Each test has a bit to request it and a bit giving the result
**       All the test when required are runned in the context of the given uart
**       The kind of test the library runs are:
**       - stack usage (how much stack does the library requires)
**       - heap usage (check if there is enough memory and it frees all the used resources)
**       - send and receive funcionality using loopback mode
    rs232_stack_test = 1<<0, //!< check the stack used by the library
    rs232_heap_test =  1<<1, //!< check the heap used by the library
    rs232_loop_back = 1<<2, //!< check if the driver works fine sending and receiving in loopback mode
    rs232_connect_test = 1<<3, //!< check if the uart is connected
    rs232_get_line_test = 1<<4, //!< check the get_line function
    rs232_enqueue_test = 1<<5, //!< check if the enqueue+flush funtions works as espected in loopback mode
**
**
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_not_all_test_passed: Any of the requested test has not been passed OK.
**
*/
SCOPE rs232_return_code RS232_Test_Library(rs232_handle uart, unsigned long test_suit, unsigned long *test_result, unsigned long *stack_usage);

/*****************************************************************************/
/**
** Purpose: This function is used in a non thread implementation of the library
** as far as there are no threads for the reception, the application must call
** this function periodically in order to do all the required reception stuffs
**
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: ok
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
**
*/
SCOPE rs232_return_code RS232_Rec_Loop(rs232_handle uart);


/*****************************************************************************/
/**
** Purpose: to manage break signal in a serial line. If the port is not serial
** does nothing.
** break_st parameter indicates with (1 set break, 0 clear break, 2 pulse break during
** ms miliseconds (in that case the function blocks this miliseconds until it returns
** **
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo
"rs232_return_code":
"   rs232_success: si el buffer de transmisi?n se ha vaciado antes de
que se agote el timeout proporcionado.
"   rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
**
*/
SCOPE rs232_return_code RS232_Control_Line_Break(rs232_handle uart, int break_st, unsigned int ms);

/*****************************************************************************/
/**
** Purpose: to manage a serial port handshake pins. If the port is not serial
** does nothing.
** RTS (usually pin 7 in DB9) and DTR (pin 4 in DB9) are outputs (1 High or 0 for low)
** CD (pin 1 in DB9), DSR (pin 6 in DB9) and CTS (pin 8 in DB9) are inputs
**
Retorno:    El resultado ser? uno de los siguientes c?digos del tipo \sa rs232_return_code
**  rs232_success: si el handle corresponde con un puerto serie.
**  rs232_error_invalid_uart_handle: El par?metro de entrada no es v?lido.
**  rs232_error_invalid_configuration: si el puerto no es un puerto serie
**
*/
SCOPE rs232_return_code RS232_Hw_Pin_Control(rs232_handle uart,
        uint8_t rts, uint8_t dtr
        , uint8_t *cd_p, uint8_t *dsr_p, uint8_t *cts_p);

#ifdef __cplusplus
}
#endif



#endif /*end guard */
#undef SCOPE

/*
** End of $RCSfile: rs232.h,v $
******************************************************************************/





