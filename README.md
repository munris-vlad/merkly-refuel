# Merkly refuel

### npm install

Текущий вариант софта ищет необходимую сумму в полигоне/арбе/оптимизме (bnb -> zora не поддерживается) и делает refuel в Zora.

`node refuel 2-2.5` - зарандомит сумму в этом промежутке (для каждого акка) и отправит ее в Zora

Можно ограничить в каких сетях ищет газ:
`node refuel 1-2 polygon,arbitrum` - если хотите в какой-то сети газ не трогать

Таким образом мы делаем ежемесячную активность для L0 и получаем газ для работы в новых сетях.
В планах добавить Linea и Base.
